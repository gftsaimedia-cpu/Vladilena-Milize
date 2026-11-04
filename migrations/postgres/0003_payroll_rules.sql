-- Luật tính lương mới: lương KPI đề xuất theo tháng và tỷ lệ bảo hiểm cấu hình được.

ALTER TABLE kpi_scores ADD COLUMN kpi_proposed BIGINT CHECK (kpi_proposed IS NULL OR kpi_proposed >= 0); -- lương KPI đề xuất của tháng (VND); NULL = chưa nhập

INSERT INTO settings (key, value_json) VALUES ('insurance_rates', '{"bhxh":0.08,"bhyt":0.015,"bhtn":0.01}') ON CONFLICT (key) DO NOTHING; -- tỷ lệ bảo hiểm người lao động đóng: BHXH 8% + BHYT 1,5% + BHTN 1%
