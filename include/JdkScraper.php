<?php

/**
 * JdkScraper — fetches the JEP list and release date for a given JDK version
 * from https://openjdk.org/projects/jdk/{version}/.
 *
 * Throws RuntimeException (with a human-readable message) on any failure so
 * that the API controller can surface the error to the browser without leaking
 * internal details.
 */
class JdkScraper
{
    private const BASE_URL    = 'https://openjdk.org/projects/jdk/';
    private const CURL_TIMEOUT    = 15;
    private const CURL_MAX_REDIRS = 3;

    /**
     * Scrape the JEP list and release date for the given JDK version.
     *
     * @param  string $version  Numeric JDK version string, e.g. "25"
     * @return array{jdk_version: string, release_date: string, jeps: list<array{number: string, title: string}>}
     * @throws RuntimeException
     */
    public function scrape(string $version): array
    {
        $url  = self::BASE_URL . $version . '/';
        $html = $this->fetch($url);

        // Suppress HTML-parsing warnings — the openjdk.org pages are not
        // perfectly valid XML and libxml would otherwise spew notices.
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        $doc->loadHTML($html);
        libxml_clear_errors();

        $xpath = new DOMXPath($doc);

        $jeps        = $this->extractJeps($xpath);
        $releaseDate = $this->extractReleaseDate($xpath);

        if (empty($jeps)) {
            throw new RuntimeException(
                "No JEPs found for JDK {$version}. "
                . "The page may not exist yet or the format may have changed."
            );
        }

        return [
            'jdk_version'  => $version,
            'release_date' => $releaseDate,
            'jeps'         => $jeps,
        ];
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Perform an HTTP GET via cURL and return the response body.
     *
     * @throws RuntimeException on network failure or non-200 status.
     */
    private function fetch(string $url): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::CURL_TIMEOUT,
            CURLOPT_MAXREDIRS      => self::CURL_MAX_REDIRS,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING       => '',  // accept any supported encoding; cURL decompresses automatically
            CURLOPT_USERAGENT      => 'JEP-Presenter/1.0 (+https://github.com/)',
        ]);

        $body       = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError  = curl_error($ch);
        curl_close($ch);

        if ($body === false || $curlError !== '') {
            throw new RuntimeException("Failed to fetch {$url}: {$curlError}");
        }

        if ($statusCode !== 200) {
            throw new RuntimeException(
                "Unexpected HTTP {$statusCode} from {$url}. "
                . "Check that the JDK version exists."
            );
        }

        return $body;
    }

    /**
     * Extract a deduplicated list of JEPs from all anchors whose href
     * contains "/jeps/".
     *
     * @return list<array{number: string, title: string}>
     */
    private function extractJeps(DOMXPath $xpath): array
    {
        $nodes = $xpath->query('//a[contains(@href, "/jeps/")]');
        $seen  = [];
        $jeps  = [];

        foreach ($nodes as $node) {
            $href = $node->getAttribute('href');

            // Extract the JEP number from the href path segment.
            if (!preg_match('#/jeps/(\d+)#', $href, $matches)) {
                continue;
            }
            $number = $matches[1];

            // Deduplicate — keep first occurrence.
            if (isset($seen[$number])) {
                continue;
            }
            $seen[$number] = true;

            $rawText = trim($node->textContent);
            $title   = $this->stripJepPrefix($rawText, $number);

            $jeps[] = ['number' => $number, 'title' => $title];
        }

        return $jeps;
    }

    /**
     * Strip leading "JEP NNN: " or "JEP NNN — " prefix from raw link text.
     * If the text is just the bare number, return an empty string.
     */
    private function stripJepPrefix(string $text, string $number): string
    {
        // Match "JEP 123: Title" or "JEP 123 — Title" (em-dash variant)
        $pattern = '/^JEP\s+' . preg_quote($number, '/') . '\s*[:\x{2014}-]\s*/u';
        $stripped = preg_replace($pattern, '', $text) ?? $text;

        // If the whole text was just the number, return empty string.
        if ($stripped === $number) {
            return '';
        }

        return $stripped;
    }

    /**
     * Extract the General Availability date from the milestones table,
     * converting "YYYY/MM/DD" to "Month YYYY".
     * Returns an empty string if the date cannot be found.
     */
    private function extractReleaseDate(DOMXPath $xpath): string
    {
        // Find the <tr> in the milestones table that mentions "General Availability"
        $rows = $xpath->query(
            '//table[contains(@class,"milestones")]'
            . '//tr[contains(.,"General Availability")]'
        );

        if ($rows === false || $rows->length === 0) {
            return '';
        }

        // The date is in the first <td> of that row.
        $tds = $xpath->query('.//td', $rows->item(0));
        if ($tds === false || $tds->length === 0) {
            return '';
        }

        $rawDate = trim($tds->item(0)->textContent);

        // Expect "YYYY/MM/DD"
        if (!preg_match('#^(\d{4})/(\d{2})/(\d{2})$#', $rawDate, $m)) {
            return '';
        }

        $timestamp = mktime(0, 0, 0, (int) $m[2], (int) $m[3], (int) $m[1]);

        return $timestamp !== false ? date('F Y', $timestamp) : '';
    }
}
