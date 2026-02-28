<?php

require_once __DIR__ . '/../../include/db.php';
require_once __DIR__ . '/../../include/SlideRepository.php';

header('Content-Type: application/json');

$repo   = new SlideRepository($pdo);
$method = $_SERVER['REQUEST_METHOD'];

// ---------------------------------------------------------------------------
// Helper — decode JSON request body
// ---------------------------------------------------------------------------
function jsonBody(): array
{
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// ---------------------------------------------------------------------------
// Route by HTTP method
// ---------------------------------------------------------------------------
switch ($method) {

    // -------------------------------------------------------------------------
    // GET — return all slides for presentation 1, ordered by position
    // -------------------------------------------------------------------------
    case 'GET':
        $slides = $repo->getAll(1);

        http_response_code(200);
        echo json_encode(['slides' => $slides]);
        break;

    // -------------------------------------------------------------------------
    // POST — create example slide  OR  reorder (dispatched via ?action=reorder)
    // -------------------------------------------------------------------------
    case 'POST':
        $action = $_GET['action'] ?? '';

        if ($action === 'reorder') {
            // ---- Reorder handler ----
            $body      = jsonBody();
            $id        = isset($body['id']) && is_numeric($body['id']) ? (int) $body['id'] : 0;
            $direction = $body['direction'] ?? '';

            if (!$id || !in_array($direction, ['up', 'down'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid id and direction (up|down) are required.']);
                break;
            }

            try {
                $repo->reorder($id, $direction);
                http_response_code(200);
                echo json_encode(['success' => true]);
            } catch (RuntimeException $e) {
                http_response_code($e->getCode() ?: 500);
                echo json_encode(['error' => $e->getMessage()]);
            } catch (Throwable $e) {
                http_response_code(500);
                echo json_encode(['error' => 'An unexpected error occurred.']);
            }
            break;
        }

        // ---- Create example slide handler ----
        $body        = jsonBody();
        $parentJepId = isset($body['parent_jep_id']) && is_numeric($body['parent_jep_id'])
            ? (int) $body['parent_jep_id']
            : 0;

        if (!$parentJepId) {
            http_response_code(400);
            echo json_encode(['error' => 'parent_jep_id is required and must be numeric.']);
            break;
        }

        try {
            $newSlide = $repo->create(1, $parentJepId);
            http_response_code(201);
            echo json_encode(['success' => true, 'slide' => $newSlide]);
        } catch (Throwable $e) {
            $code = $e->getCode() ?: 500;
            http_response_code($code);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // -------------------------------------------------------------------------
    // PATCH — update one or more fields on a single slide
    // -------------------------------------------------------------------------
    case 'PATCH':
        $body = jsonBody();
        $id   = isset($body['id']) && is_numeric($body['id']) ? (int) $body['id'] : 0;

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'id is required and must be numeric.']);
            break;
        }

        try {
            $repo->update($id, $body);
            http_response_code(200);
            echo json_encode(['success' => true]);
        } catch (Throwable $e) {
            $code = $e->getCode() ?: 500;
            http_response_code($code);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    // -------------------------------------------------------------------------
    // DELETE — remove a slide (title slide is protected)
    // -------------------------------------------------------------------------
    case 'DELETE':
        $body = jsonBody();
        $id   = isset($body['id']) && is_numeric($body['id']) ? (int) $body['id'] : 0;

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'id is required and must be numeric.']);
            break;
        }

        try {
            $repo->delete($id);
            http_response_code(200);
            echo json_encode(['success' => true]);
        } catch (RuntimeException $e) {
            http_response_code($e->getCode() ?: 500);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'An unexpected error occurred.']);
        }
        break;

    // -------------------------------------------------------------------------
    // Method not allowed
    // -------------------------------------------------------------------------
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed.']);
        break;
}
