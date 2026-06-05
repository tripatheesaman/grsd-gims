-- Capital RRP / asset receive schema (idempotent where possible)
CREATE TABLE IF NOT EXISTS asset_receive_details (
    id INT NOT NULL AUTO_INCREMENT,
    model_name VARCHAR(255) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    remaining_quantity DECIMAL(18,4) NOT NULL,
    receive_date DATE NOT NULL,
    approval_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    received_by VARCHAR(255) NULL,
    approved_by VARCHAR(255) NULL,
    rejected_by VARCHAR(255) NULL,
    rejection_reason TEXT NULL,
    rrp_fk INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_asset_receive_date (receive_date),
    KEY idx_asset_receive_rrp (rrp_fk),
    KEY idx_asset_receive_approval (approval_status)
) ENGINE=InnoDB;

ALTER TABLE rrp_details MODIFY receive_fk INT NULL;
