<?php

require_once __DIR__ . '/../../include/db.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {

    // -------------------------------------------------------------------------
    case 'GET':
        $row = $pdo->query('SELECT * FROM presentation LIMIT 1')->fetch();
        if ($row === false) {
            http_response_code(404);
            echo json_encode(['error' => 'No presentation found.']);
            exit;
        }
        http_response_code(200);
        echo json_encode($row);
        break;

    // -------------------------------------------------------------------------
    case 'POST':
        $body = json_decode(file_get_contents('php://input'), true);

        // Validate required fields.
        if (
            empty($body['jdk_version'])
            || !isset($body['title'])
            || !isset($body['jeps'])
            || !is_array($body['jeps'])
        ) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing required fields: jdk_version, title, jeps.']);
            exit;
        }

        $jdkVersion  = (string) $body['jdk_version'];
        $title       = (string) $body['title'];
        $subtitle    = isset($body['subtitle'])    ? (string) $body['subtitle']    : '';
        $releaseDate = isset($body['release_date']) ? (string) $body['release_date'] : '';
        $jeps        = $body['jeps'];

        $pdo->beginTransaction();
        try {
            // Replace presentation and all slides atomically.
            $pdo->exec('DELETE FROM slides');
            $pdo->exec('DELETE FROM presentation');

            $insertPresentation = $pdo->prepare(
                'INSERT INTO presentation (id, jdk_version, title, subtitle, release_date)
                 VALUES (1, ?, ?, ?, ?)'
            );
            $insertPresentation->execute([$jdkVersion, $title, $subtitle, $releaseDate]);

            // Title slide is always position 1.
            $insertSlide = $pdo->prepare(
                'INSERT INTO slides (presentation_id, type, position)
                 VALUES (1, ?, ?)'
            );
            $insertSlide->execute(['title', 1]);

            // One JEP slide per JEP, starting at position 2.
            $insertJepSlide = $pdo->prepare(
                'INSERT INTO slides (presentation_id, type, position, jep_number, jep_title)
                 VALUES (1, \'jep\', ?, ?, ?)'
            );
            $position = 2;
            foreach ($jeps as $jep) {
                $insertJepSlide->execute([
                    $position++,
                    (string) ($jep['number'] ?? ''),
                    (string) ($jep['title']  ?? ''),
                ]);
            }

            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error.']);
            exit;
        }

        $slideCount = 1 + count($jeps); // title slide + JEP slides
        http_response_code(201);
        echo json_encode([
            'success'         => true,
            'presentation_id' => 1,
            'slide_count'     => $slideCount,
        ]);
        break;

    // -------------------------------------------------------------------------
    case 'PATCH':
        $body = json_decode(file_get_contents('php://input'), true);

        // Only these fields may be updated via PATCH.
        $allowed = ['title', 'subtitle', 'release_date'];
        $setClauses = [];
        $params     = [];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $setClauses[] = "{$field} = ?";
                $params[]     = (string) $body[$field];
            }
        }

        if (empty($setClauses)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No patchable fields provided.']);
            exit;
        }

        $sql = 'UPDATE presentation SET ' . implode(', ', $setClauses) . ' WHERE id = 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        http_response_code(200);
        echo json_encode(['success' => true]);
        break;

    // -------------------------------------------------------------------------
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed.']);
        break;
}
