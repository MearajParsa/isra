-- دیتابیس محلی api-high (با root یک‌بار اجرا کنید): mysql -uroot -p < services/api-high/scripts/local-db.sql
CREATE DATABASE IF NOT EXISTS schema_high CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS schema_high_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'isra_high'@'127.0.0.1' IDENTIFIED BY 'isra_high_dev';
CREATE USER IF NOT EXISTS 'isra_high'@'localhost' IDENTIFIED BY 'isra_high_dev';
GRANT ALL PRIVILEGES ON schema_high.*      TO 'isra_high'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_high_test.* TO 'isra_high'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_high.*      TO 'isra_high'@'localhost';
GRANT ALL PRIVILEGES ON schema_high_test.* TO 'isra_high'@'localhost';
FLUSH PRIVILEGES;
