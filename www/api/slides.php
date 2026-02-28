<?php

require_once __DIR__ . '/../../include/db.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {

    // -------------------------------------------------------------------------
    // 4.4–4.5 GET — return all slides for presentation 1, ordered by position
    // -------------------------------------------------------------------------
    case 'GET':
        $stmt = $pdo->prepare(
            'SELECT * FROM slides WHERE presentation_id = 1 ORDER BY position ASC'
        );
        $stmt->execute();
        $slides = $stmt->fetchAll();

        http_response_code(200);
        echo json_encode(['slides' => $slides ?: []]);
        break;

    // -------------------------------------------------------------------------
    // 3.4 PATCH — update one or more fields on a single slide
    // -------------------------------------------------------------------------
    case 'PATCH':
        $body = json_decode(file_get_contents('php://input'), true);
        $id   = (int)($body['id'] ?? 0);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            break;
        }

        $allowed    = ['jep_number', 'jep_title', 'slide_title', 'code_content'];
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
            echo json_encode(['error' => 'no valid fields to update']);
            break;
        }

        $params[] = $id;
        $sql  = 'UPDATE slides SET ' . implode(', ', $setClauses) . ' WHERE id = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Slide not found.']);
            break;
        }

        http_response_code(200);
        echo json_encode(['success' => true]);
        break;

    // -------------------------------------------------------------------------
    // POST / DELETE — stubbed until Phase 4 (slide CRUD & reorder)
    // -------------------------------------------------------------------------
    default:
        http_response_code(501);
        echo json_encode(['error' => 'not implemented']);
        break;
}
