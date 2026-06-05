-- Historical issue imports (e.g. prior-year Excel) for stock level analysis.
-- Does not affect live stock balances or issue_details.

CREATE TABLE IF NOT EXISTS historical_issue_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issue_date DATE NOT NULL,
    nac_code VARCHAR(64) NOT NULL,
    issue_quantity DECIMAL(18, 4) NOT NULL,
    source_file VARCHAR(255) NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_by VARCHAR(255) NULL,
    INDEX idx_historical_issue_nac_date (nac_code, issue_date),
    INDEX idx_historical_issue_date (issue_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
