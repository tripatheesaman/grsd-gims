-- Asset Management System Database Schema
-- Run these queries manually in your MySQL database

-- 1. Create asset_types table
CREATE TABLE IF NOT EXISTS asset_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create asset_type_properties table
-- This table defines which properties are enabled for each asset type
CREATE TABLE IF NOT EXISTS asset_type_properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_type_id INT NOT NULL,
    property_name VARCHAR(100) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
    UNIQUE KEY unique_asset_type_property (asset_type_id, property_name),
    INDEX idx_asset_type_id (asset_type_id),
    INDEX idx_property_name (property_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create assets table
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_type_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_asset_type_id (asset_type_id),
    INDEX idx_name (name),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create asset_property_values table
-- This table stores the actual property values for each asset
CREATE TABLE IF NOT EXISTS asset_property_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    property_name VARCHAR(100) NOT NULL,
    property_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE KEY unique_asset_property (asset_id, property_name),
    INDEX idx_asset_id (asset_id),
    INDEX idx_property_name (property_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valid property names (for reference):
-- equipment_manufacturer_name
-- model_name
-- series
-- engine_number
-- engine_model_number
-- serial_number
-- transmission_model
-- chassis_number
-- weight
-- name
-- size
-- quantity
-- purchase_year
-- purchase_amount

