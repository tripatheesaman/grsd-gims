-- Search performance indexes (run manually on production if missing)
-- Check first: SHOW INDEX FROM stock_details;
-- Skip any statement that returns "Duplicate key name"

-- Denormalized stock search blob (populated on startup / stock save)
ALTER TABLE stock_details ADD COLUMN search_key VARCHAR(512) NULL;
CREATE INDEX idx_stock_details_search_key ON stock_details (search_key(191));

CREATE INDEX idx_stock_details_nac_code ON stock_details (nac_code);
CREATE INDEX idx_stock_details_base_nac ON stock_details (base_nac_code);
CREATE INDEX idx_stock_details_part_numbers ON stock_details (part_numbers(191));

CREATE INDEX idx_request_details_request_number ON request_details (request_number);
CREATE INDEX idx_request_details_part_number ON request_details (part_number);
CREATE INDEX idx_request_details_nac_code ON request_details (nac_code);
CREATE INDEX idx_request_details_status_received ON request_details (approval_status, is_received);
CREATE INDEX idx_request_details_equipment_number_request_date ON request_details (equipment_number, request_date);

CREATE INDEX idx_receive_details_request_fk_status ON receive_details (request_fk, approval_status);
CREATE INDEX idx_receive_details_part_number ON receive_details (part_number);
CREATE INDEX idx_receive_details_nac_code ON receive_details (nac_code);
CREATE INDEX idx_receive_details_equipment_number_receive_date ON receive_details (equipment_number, receive_date);

CREATE INDEX idx_rrp_details_rrp_number ON rrp_details (rrp_number);

CREATE INDEX idx_issue_details_part_number ON issue_details (part_number);
CREATE INDEX idx_issue_details_nac_code ON issue_details (nac_code);

CREATE INDEX idx_assets_equipment_code ON assets (equipment_code);
CREATE INDEX idx_assets_name ON assets (name(191));

CREATE INDEX idx_users_username ON users (username);
