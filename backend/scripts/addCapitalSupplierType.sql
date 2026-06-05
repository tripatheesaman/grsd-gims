-- Allow Capital (RRCP) suppliers alongside spare Local/Foreign RRP suppliers.
ALTER TABLE suppliers
  MODIFY supplier_type ENUM('local', 'foreign', 'capital') NOT NULL;
