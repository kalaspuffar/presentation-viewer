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
    // POST / PATCH / DELETE — stubbed until Phase 4 (slide CRUD & reorder)
    // -------------------------------------------------------------------------
    default:
        http_response_code(501);
        echo json_encode(['error' => 'not implemented']);
        break;
}
