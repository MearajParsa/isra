-- دیتابیس محلی (MySQL 8 / MariaDB). یک‌بار با کاربر root اجرا کنید:
--   mysql -uroot -p < services/api-low/scripts/local-db.sql
-- (رمز زیر فقط برای ماشین توسعه است؛ روی هاست رمز قوی و جدا بگذارید.)
CREATE DATABASE IF NOT EXISTS schema_low  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS schema_low_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'isra_low'@'127.0.0.1' IDENTIFIED BY 'isra_low_dev';
CREATE USER IF NOT EXISTS 'isra_low'@'localhost' IDENTIFIED BY 'isra_low_dev';
GRANT ALL PRIVILEGES ON schema_low.*      TO 'isra_low'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_low_test.* TO 'isra_low'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_low.*      TO 'isra_low'@'localhost';
GRANT ALL PRIVILEGES ON schema_low_test.* TO 'isra_low'@'localhost';
FLUSH PRIVILEGES;
