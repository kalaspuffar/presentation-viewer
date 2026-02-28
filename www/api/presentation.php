<?php

http_response_code(501);
header('Content-Type: application/json');
echo json_encode(['error' => 'not implemented']);
