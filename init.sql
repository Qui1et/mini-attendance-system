CREATE DATABASE IF NOT EXISTS techtest;
USE techtest;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  checkin_time DATETIME,
  checkout_time DATETIME,
  date DATE AS (DATE(checkin_time)) STORED,
  late TINYINT(1) DEFAULT 0,
  early TINYINT(1) DEFAULT 0,
  UNIQUE KEY unique_checkin (employee_id, date, checkin_time),
  UNIQUE KEY unique_checkout (employee_id, date, checkout_time)
);

CREATE TABLE IF NOT EXISTS daily_summary (
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  checkin_time VARCHAR(20),
  checkout_time VARCHAR(20),
  status ENUM('present', 'late', 'early_leave', 'absent') DEFAULT 'absent',
  PRIMARY KEY (employee_id, date)
);

-- ADMIN USER: admin@company.com / password123
-- HASH bcrypt.hashSync("password123", 10)
INSERT INTO employees (name, email, password) VALUES 
('Admin User', 'admin@company.com', '$2a$10$6XHOV9nSih8oj7upZ6qPIOBntXmmPwIQXuGapgKp9VpQe5gHQvy32')
ON DUPLICATE KEY UPDATE password = VALUES(password);