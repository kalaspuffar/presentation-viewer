<?php

/**
 * SlideRepository — centralises all slide data operations.
 *
 * All methods use PDO prepared statements.  Every mutation that touches more
 * than one row is wrapped in a transaction so positions remain contiguous
 * after every insert, delete, and reorder.
 */
class SlideRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    // -------------------------------------------------------------------------
    // getAll — return all slides for a presentation ordered by position
    // -------------------------------------------------------------------------

    public function getAll(int $presentationId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM slides WHERE presentation_id = :id ORDER BY position ASC'
        );
        $stmt->execute([':id' => $presentationId]);
        return $stmt->fetchAll();
    }

    // -------------------------------------------------------------------------
    // create — insert a new example slide after the last example for a JEP
    // -------------------------------------------------------------------------

    public function create(int $presentationId, int $parentJepId): array
    {
        // Fetch the parent JEP slide, scoped to this presentation, to get its
        // jep_number and position.  The presentation_id check ensures a caller
        // cannot reference a parent slide from a different presentation.
        $parentStmt = $this->pdo->prepare(
            'SELECT * FROM slides WHERE id = :parentJepId AND presentation_id = :presentationId'
        );
        $parentStmt->execute([':parentJepId' => $parentJepId, ':presentationId' => $presentationId]);
        $parentSlide = $parentStmt->fetch();

        if (!$parentSlide) {
            throw new RuntimeException('Parent JEP slide not found.', 404);
        }

        // Find the maximum position among slides that are children of this JEP.
        $maxStmt = $this->pdo->prepare(
            'SELECT MAX(position) FROM slides WHERE parent_jep_id = :parentJepId'
        );
        $maxStmt->execute([':parentJepId' => $parentJepId]);
        $maxExamplePosition = $maxStmt->fetchColumn();

        // Determine where to insert: immediately after the last example, or
        // immediately after the parent JEP slide if no examples exist yet.
        $insertionPosition = ($maxExamplePosition !== null && $maxExamplePosition !== false)
            ? (int) $maxExamplePosition + 1
            : (int) $parentSlide['position'] + 1;

        $this->pdo->beginTransaction();
        try {
            // Shift every slide at or after the insertion position down by one.
            //
            // SQLite checks UNIQUE constraints after each individual row update,
            // not after the full statement.  A plain +1 update therefore fails
            // as soon as the first row collides with its still-unshifted
            // neighbour.  We work around this with a two-step approach that
            // mirrors the temp-zero trick used in reorder():
            //   1. Move affected rows to unique negative positions.
            //   2. Negate them back to their final (shifted) values.
            $shiftStmt = $this->pdo->prepare(
                'UPDATE slides
                    SET position = -(position + 1)
                  WHERE position >= :insertionPosition
                    AND presentation_id = :presentationId'
            );
            $shiftStmt->execute([
                ':insertionPosition' => $insertionPosition,
                ':presentationId'    => $presentationId,
            ]);

            $shiftFinalStmt = $this->pdo->prepare(
                'UPDATE slides
                    SET position = -position
                  WHERE position < 0
                    AND presentation_id = :presentationId'
            );
            $shiftFinalStmt->execute([':presentationId' => $presentationId]);

            // Insert the new example slide.
            $insertStmt = $this->pdo->prepare(
                'INSERT INTO slides (presentation_id, type, position, jep_number, parent_jep_id)
                 VALUES (:presentationId, \'example\', :position, :jepNumber, :parentJepId)'
            );
            $insertStmt->execute([
                ':presentationId' => $presentationId,
                ':position'       => $insertionPosition,
                ':jepNumber'      => $parentSlide['jep_number'],
                ':parentJepId'    => $parentJepId,
            ]);

            $newId = (int) $this->pdo->lastInsertId();
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        // Return the freshly inserted row.
        $selectStmt = $this->pdo->prepare('SELECT * FROM slides WHERE id = :id');
        $selectStmt->execute([':id' => $newId]);
        return $selectStmt->fetch();
    }

    // -------------------------------------------------------------------------
    // update — patch one or more whitelisted fields on a slide
    // -------------------------------------------------------------------------

    public function update(int $id, array $fields): void
    {
        $allowed  = ['jep_number', 'jep_title', 'slide_title', 'code_content'];
        $filtered = array_filter(
            $fields,
            fn($key) => in_array($key, $allowed, true),
            ARRAY_FILTER_USE_KEY
        );

        // Nothing to do — return silently rather than issuing an empty UPDATE.
        if (empty($filtered)) {
            return;
        }

        $setClauses = array_map(fn($col) => "{$col} = :{$col}", array_keys($filtered));
        $sql        = 'UPDATE slides SET ' . implode(', ', $setClauses) . ' WHERE id = :id';

        $params = array_combine(
            array_map(fn($col) => ":{$col}", array_keys($filtered)),
            array_values($filtered)
        );
        $params[':id'] = $id;

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            throw new RuntimeException('Slide not found.', 404);
        }
    }

    // -------------------------------------------------------------------------
    // delete — remove a slide and re-sequence positions
    // -------------------------------------------------------------------------

    public function delete(int $id): void
    {
        $fetchStmt = $this->pdo->prepare('SELECT * FROM slides WHERE id = :id');
        $fetchStmt->execute([':id' => $id]);
        $slide = $fetchStmt->fetch();

        if (!$slide) {
            throw new RuntimeException('Slide not found.', 404);
        }

        if ($slide['type'] === 'title') {
            throw new RuntimeException('The presentation title slide cannot be deleted.', 403);
        }

        $deletedPosition = (int) $slide['position'];
        $presentationId  = (int) $slide['presentation_id'];

        $this->pdo->beginTransaction();
        try {
            $deleteStmt = $this->pdo->prepare('DELETE FROM slides WHERE id = :id');
            $deleteStmt->execute([':id' => $id]);

            // Close the gap by shifting all slides after the deleted one up by one.
            //
            // Same two-step negation pattern as in create(): SQLite checks
            // UNIQUE constraints row-by-row, so a plain -1 update would fail
            // when two adjacent rows are shifted and the first move collides
            // with a row that hasn't been updated yet.
            $resequenceStmt = $this->pdo->prepare(
                'UPDATE slides
                    SET position = -(position - 1)
                  WHERE position > :deletedPosition
                    AND presentation_id = :presentationId'
            );
            $resequenceStmt->execute([
                ':deletedPosition' => $deletedPosition,
                ':presentationId'  => $presentationId,
            ]);

            $resequenceFinalStmt = $this->pdo->prepare(
                'UPDATE slides
                    SET position = -position
                  WHERE position < 0
                    AND presentation_id = :presentationId'
            );
            $resequenceFinalStmt->execute([':presentationId' => $presentationId]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // -------------------------------------------------------------------------
    // reorder — swap the position of a slide with its neighbour
    // -------------------------------------------------------------------------

    public function reorder(int $id, string $direction): void
    {
        if ($direction !== 'up' && $direction !== 'down') {
            throw new InvalidArgumentException("Direction must be 'up' or 'down'.");
        }

        $fetchStmt = $this->pdo->prepare('SELECT * FROM slides WHERE id = :id');
        $fetchStmt->execute([':id' => $id]);
        $target = $fetchStmt->fetch();

        if (!$target) {
            throw new RuntimeException('Slide not found.', 404);
        }

        if ($target['type'] === 'title') {
            throw new RuntimeException('The title slide cannot be moved.', 403);
        }

        $targetPosition = (int) $target['position'];
        $neighbourPosition = $direction === 'up'
            ? $targetPosition - 1
            : $targetPosition + 1;

        $neighbourStmt = $this->pdo->prepare(
            'SELECT * FROM slides
              WHERE position = :position
                AND presentation_id = :presentationId'
        );
        $neighbourStmt->execute([
            ':position'       => $neighbourPosition,
            ':presentationId' => $target['presentation_id'],
        ]);
        $neighbour = $neighbourStmt->fetch();

        if (!$neighbour) {
            throw new RuntimeException('No neighbour slide to swap with.', 400);
        }

        // Prevent any swap that would displace the title slide from position 1.
        if ($neighbour['type'] === 'title') {
            throw new RuntimeException('Cannot move a slide above the title slide.', 400);
        }

        // Swap positions using a temporary value (0) to avoid the unique index
        // constraint that would fire if both rows were updated sequentially to
        // each other's positions.
        $this->pdo->beginTransaction();
        try {
            // Move target to a temporary position that cannot clash.
            $tempStmt = $this->pdo->prepare(
                'UPDATE slides SET position = 0 WHERE id = :id'
            );
            $tempStmt->execute([':id' => $id]);

            // Move neighbour into target's original position.
            $moveNeighbourStmt = $this->pdo->prepare(
                'UPDATE slides SET position = :targetPosition WHERE id = :neighbourId'
            );
            $moveNeighbourStmt->execute([
                ':targetPosition' => $targetPosition,
                ':neighbourId'    => $neighbour['id'],
            ]);

            // Move target into neighbour's original position.
            $moveTargetStmt = $this->pdo->prepare(
                'UPDATE slides SET position = :neighbourPosition WHERE id = :targetId'
            );
            $moveTargetStmt->execute([
                ':neighbourPosition' => $neighbourPosition,
                ':targetId'          => $id,
            ]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
