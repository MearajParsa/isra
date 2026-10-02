-- دیتابیس محلی api-mid (با root یک‌بار اجرا کنید): mysql -uroot -p < services/api-mid/scripts/local-db.sql
CREATE DATABASE IF NOT EXISTS schema_mid CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS schema_mid_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'isra_mid'@'127.0.0.1' IDENTIFIED BY 'isra_mid_dev';
CREATE USER IF NOT EXISTS 'isra_mid'@'localhost' IDENTIFIED BY 'isra_mid_dev';
GRANT ALL PRIVILEGES ON schema_mid.*      TO 'isra_mid'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_mid_test.* TO 'isra_mid'@'127.0.0.1';
GRANT ALL PRIVILEGES ON schema_mid.*      TO 'isra_mid'@'localhost';
GRANT ALL PRIVILEGES ON schema_mid_test.* TO 'isra_mid'@'localhost';
FLUSH PRIVILEGES;
