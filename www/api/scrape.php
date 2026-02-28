<?php

require_once __DIR__ . '/../../include/JdkScraper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$body    = json_decode(file_get_contents('php://input'), true);
$version = isset($body['version']) ? trim((string) $body['version']) : '';

// Validate: must be present, digits only, and in range 8–99.
if ($version === '' || !ctype_digit($version) || (int) $version < 8 || (int) $version > 99) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid version number.']);
    exit;
}

try {
    $scraper = new JdkScraper();
    $result  = $scraper->scrape($version);
} catch (RuntimeException $e) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}

http_response_code(200);
echo json_encode([
    'success'      => true,
    'jdk_version'  => $result['jdk_version'],
    'release_date' => $result['release_date'],
    'jep_count'    => count($result['jeps']),
    'jeps'         => $result['jeps'],
]);
