-- Historical receive imports (e.g. prior-year Excel) for stock level analysis.

CREATE TABLE IF NOT EXISTS historical_receive_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receive_date DATE NOT NULL,
    nac_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    received_quantity DECIMAL(18, 4) NOT NULL,
    unit VARCHAR(32) NULL,
    source_file VARCHAR(255) NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_by VARCHAR(255) NULL,
    INDEX idx_historical_receive_nac_date (nac_code, receive_date),
    INDEX idx_historical_receive_date (receive_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
