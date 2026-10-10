-- 000_baseline.sql
-- Schema-only snapshot of the live hospital_db (MySQL 9.7.1), taken 2026-10-09 with:
--   mysqldump --no-data --routines --triggers --events --skip-add-drop-table
-- AUTO_INCREMENT counters and DEFINER clauses removed. This is the source of truth for the
-- schema; database/schema.sql + lab_pharmacy_workflow.sql do NOT reproduce it.
-- Only ever applied to an empty database (the test DB). On hospital_db it is marked as applied.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admissions` (
  `admission_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `bed_id` int NOT NULL,
  `department_id` int NOT NULL,
  `emergency_id` int DEFAULT NULL,
  `admission_date` datetime NOT NULL,
  `discharge_date` datetime DEFAULT NULL,
  `status` enum('ACTIVE','DISCHARGED','TRANSFERRED') DEFAULT 'ACTIVE',
  `diagnosis` text NOT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`admission_id`),
  KEY `department_id` (`department_id`),
  KEY `emergency_id` (`emergency_id`),
  KEY `idx_admissions_patient_status` (`patient_id`,`status`),
  KEY `idx_admissions_bed_status` (`bed_id`,`status`),
  KEY `idx_admissions_doctor_status` (`doctor_id`,`status`),
  CONSTRAINT `admissions_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `admissions_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `admissions_ibfk_3` FOREIGN KEY (`bed_id`) REFERENCES `beds` (`bed_id`) ON DELETE RESTRICT,
  CONSTRAINT `admissions_ibfk_4` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `admissions_ibfk_5` FOREIGN KEY (`emergency_id`) REFERENCES `emergency_cases` (`emergency_id`) ON DELETE SET NULL,
  CONSTRAINT `admissions_chk_1` CHECK (((`discharge_date` is null) or (`discharge_date` >= `admission_date`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `after_admission_insert` AFTER INSERT ON `admissions` FOR EACH ROW BEGIN
    UPDATE beds SET status = 'OCCUPIED' WHERE bed_id = NEW.bed_id;
    UPDATE doctors SET current_workload = current_workload + 1 WHERE doctor_id = NEW.doctor_id;
    
    INSERT INTO bed_assignment_log (bed_id, patient_id, admission_id, assigned_at, status)
    VALUES (NEW.bed_id, NEW.patient_id, NEW.admission_id, NEW.admission_date, 'ACTIVE');
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `after_admission_discharge` AFTER UPDATE ON `admissions` FOR EACH ROW BEGIN
    IF OLD.status = 'ACTIVE' AND NEW.status = 'DISCHARGED' THEN
        UPDATE beds SET status = 'AVAILABLE' WHERE bed_id = OLD.bed_id;
        UPDATE doctors SET current_workload = current_workload - 1 WHERE doctor_id = OLD.doctor_id;
        
        UPDATE bed_assignment_log 
        SET released_at = NEW.discharge_date, status = 'RELEASED'
        WHERE admission_id = NEW.admission_id AND status = 'ACTIVE';
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ambulances` (
  `ambulance_id` int NOT NULL AUTO_INCREMENT,
  `vehicle_number` varchar(20) NOT NULL,
  `driver_name` varchar(100) NOT NULL,
  `driver_phone` varchar(20) NOT NULL,
  `current_location` varchar(255) DEFAULT NULL,
  `status` enum('AVAILABLE','EN_ROUTE','ARRIVED','IN_SERVICE','MAINTENANCE') DEFAULT 'AVAILABLE',
  PRIMARY KEY (`ambulance_id`),
  UNIQUE KEY `vehicle_number` (`vehicle_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `appointment_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `department_id` int NOT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` time NOT NULL,
  `status` enum('BOOKED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW') DEFAULT 'BOOKED',
  `reason` text,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`appointment_id`),
  UNIQUE KEY `doctor_id` (`doctor_id`,`appointment_date`,`appointment_time`),
  KEY `patient_id` (`patient_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_appointments_doc_date_time` (`doctor_id`,`appointment_date`,`appointment_time`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `appointments_ibfk_3` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `available_beds_view` AS SELECT 
 1 AS `bed_id`,
 1 AS `bed_number`,
 1 AS `floor`,
 1 AS `bed_type`,
 1 AS `has_ventilator`,
 1 AS `ward_name`,
 1 AS `department_name`*/;
SET character_set_client = @saved_cs_client;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `available_doctors_view` AS SELECT 
 1 AS `doctor_id`,
 1 AS `doctor_name`,
 1 AS `specialization`,
 1 AS `phone`,
 1 AS `current_workload`,
 1 AS `max_workload`,
 1 AS `department_name`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bed_assignment_log` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `bed_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `admission_id` int NOT NULL,
  `assigned_at` datetime NOT NULL,
  `released_at` datetime DEFAULT NULL,
  `status` enum('ACTIVE','RELEASED') DEFAULT 'ACTIVE',
  PRIMARY KEY (`log_id`),
  KEY `bed_id` (`bed_id`),
  KEY `patient_id` (`patient_id`),
  KEY `admission_id` (`admission_id`),
  CONSTRAINT `bed_assignment_log_ibfk_1` FOREIGN KEY (`bed_id`) REFERENCES `beds` (`bed_id`) ON DELETE RESTRICT,
  CONSTRAINT `bed_assignment_log_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `bed_assignment_log_ibfk_3` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `after_bed_assignment_log` AFTER INSERT ON `bed_assignment_log` FOR EACH ROW BEGIN
    -- This trigger is just for demonstration if we want to cascade logs or notify systems.
    -- The actual logging is handled in the after_admission_insert and update triggers.
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `bed_status_summary_view` AS SELECT 
 1 AS `ward_name`,
 1 AS `department_name`,
 1 AS `bed_type`,
 1 AS `status`,
 1 AS `count`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beds` (
  `bed_id` int NOT NULL AUTO_INCREMENT,
  `ward_id` int NOT NULL,
  `bed_number` varchar(20) NOT NULL,
  `floor` int NOT NULL,
  `bed_type` enum('GENERAL','ICU','NICU','ISOLATION','VENTILATOR_ICU') NOT NULL,
  `status` enum('AVAILABLE','OCCUPIED','MAINTENANCE','RESERVED') DEFAULT 'AVAILABLE',
  `has_ventilator` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`bed_id`),
  UNIQUE KEY `ward_id` (`ward_id`,`bed_number`),
  KEY `idx_beds_status_type` (`status`,`bed_type`),
  KEY `idx_beds_ward_status` (`ward_id`,`status`),
  CONSTRAINT `beds_ibfk_1` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`ward_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bill_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `description` varchar(255) NOT NULL,
  `category` enum('CONSULTATION','BED','ICU','LABORATORY','MEDICINE','PROCEDURE','AMBULANCE','OTHER') NOT NULL,
  `quantity` int DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_id`),
  KEY `bill_id` (`bill_id`),
  CONSTRAINT `bill_items_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`bill_id`) ON DELETE CASCADE,
  CONSTRAINT `bill_items_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `bill_items_chk_2` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `bill_items_chk_3` CHECK ((`total_price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bills` (
  `bill_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `admission_id` int DEFAULT NULL,
  `bill_date` datetime NOT NULL,
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `paid_amount` decimal(12,2) DEFAULT '0.00',
  `status` enum('PENDING','PARTIAL','PAID','CANCELLED') DEFAULT 'PENDING',
  `payment_method` varchar(50) DEFAULT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`bill_id`),
  KEY `admission_id` (`admission_id`),
  KEY `idx_bills_patient_status` (`patient_id`,`status`),
  CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `bills_ibfk_2` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE CASCADE,
  CONSTRAINT `bills_chk_1` CHECK ((`total_amount` >= 0)),
  CONSTRAINT `bills_chk_2` CHECK (((`paid_amount` >= 0) and (`paid_amount` <= `total_amount`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consultations` (
  `consultation_id` int NOT NULL AUTO_INCREMENT,
  `appointment_id` int DEFAULT NULL,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `admission_id` int DEFAULT NULL,
  `symptoms` text NOT NULL,
  `diagnosis` text NOT NULL,
  `assessment` text,
  `plan` text,
  `notes` text,
  `consultation_time` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`consultation_id`),
  KEY `appointment_id` (`appointment_id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `admission_id` (`admission_id`),
  CONSTRAINT `consultations_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE SET NULL,
  CONSTRAINT `consultations_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `consultations_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `consultations_ibfk_4` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `current_admissions_view` AS SELECT 
 1 AS `admission_id`,
 1 AS `admission_date`,
 1 AS `diagnosis`,
 1 AS `patient_name`,
 1 AS `patient_id`,
 1 AS `doctor_name`,
 1 AS `doctor_id`,
 1 AS `bed_number`,
 1 AS `bed_type`,
 1 AS `ward_name`,
 1 AS `department_name`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `department_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `floor` int NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctor_daily_analytics` (
  `analytics_id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `analytics_date` date NOT NULL,
  `patients_seen` int DEFAULT '0',
  `emergency_cases` int DEFAULT '0',
  `appointment_patients` int DEFAULT '0',
  `patients_treated` int DEFAULT '0',
  `cases_solved` int DEFAULT '0',
  `cases_postponed` int DEFAULT '0',
  `cases_cancelled` int DEFAULT '0',
  `cases_pending` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`analytics_id`),
  UNIQUE KEY `unique_doctor_date` (`doctor_id`,`analytics_date`),
  CONSTRAINT `doctor_daily_analytics_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctor_schedules` (
  `schedule_id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `day_of_week` enum('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `is_available` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`schedule_id`),
  UNIQUE KEY `doctor_id` (`doctor_id`,`day_of_week`,`start_time`),
  CONSTRAINT `doctor_schedules_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `doctor_workload_view` AS SELECT 
 1 AS `doctor_id`,
 1 AS `name`,
 1 AS `specialization`,
 1 AS `department`,
 1 AS `status`,
 1 AS `shift`,
 1 AS `current_workload`,
 1 AS `max_workload`,
 1 AS `available_capacity`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctors` (
  `doctor_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `department_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `specialization` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` enum('AVAILABLE','BUSY','OFF_DUTY','ON_LEAVE') DEFAULT 'AVAILABLE',
  `shift` enum('MORNING','AFTERNOON','NIGHT') NOT NULL,
  `current_workload` int DEFAULT '0',
  `max_workload` int DEFAULT '5',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`doctor_id`),
  KEY `user_id` (`user_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_doctors_spec_status` (`specialization`,`status`),
  CONSTRAINT `doctors_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `doctors_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `doctors_chk_1` CHECK (((`current_workload` <= `max_workload`) and (`current_workload` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emergency_cases` (
  `emergency_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int DEFAULT NULL,
  `ambulance_id` int DEFAULT NULL,
  `severity` enum('CRITICAL','VERY_SERIOUS','SERIOUS','MODERATE','STABLE') NOT NULL,
  `symptoms` text NOT NULL,
  `arrival_time` datetime NOT NULL,
  `required_specialization` varchar(100) DEFAULT NULL,
  `required_bed_type` enum('GENERAL','ICU','NICU','ISOLATION','VENTILATOR_ICU') DEFAULT NULL,
  `ventilator_required` tinyint(1) DEFAULT '0',
  `status` enum('WAITING','TRIAGED','ALLOCATED','ADMITTED','DISCHARGED','CANCELLED') DEFAULT 'WAITING',
  `assigned_doctor_id` int DEFAULT NULL,
  `assigned_bed_id` int DEFAULT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`emergency_id`),
  KEY `patient_id` (`patient_id`),
  KEY `ambulance_id` (`ambulance_id`),
  KEY `assigned_doctor_id` (`assigned_doctor_id`),
  KEY `assigned_bed_id` (`assigned_bed_id`),
  KEY `idx_emergency_status_severity_time` (`status`,`severity`,`arrival_time`),
  CONSTRAINT `emergency_cases_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `emergency_cases_ibfk_2` FOREIGN KEY (`ambulance_id`) REFERENCES `ambulances` (`ambulance_id`) ON DELETE SET NULL,
  CONSTRAINT `emergency_cases_ibfk_3` FOREIGN KEY (`assigned_doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE SET NULL,
  CONSTRAINT `emergency_cases_ibfk_4` FOREIGN KEY (`assigned_bed_id`) REFERENCES `beds` (`bed_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `emergency_queue_view` AS SELECT 
 1 AS `emergency_id`,
 1 AS `severity`,
 1 AS `arrival_time`,
 1 AS `symptoms`,
 1 AS `required_specialization`,
 1 AS `required_bed_type`,
 1 AS `ventilator_required`,
 1 AS `patient_name`,
 1 AS `ambulance_number`*/;
SET character_set_client = @saved_cs_client;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `hospital_occupancy_view` AS SELECT 
 1 AS `bed_type`,
 1 AS `total_beds`,
 1 AS `occupied_beds`,
 1 AS `available_beds`,
 1 AS `unavailable_beds`,
 1 AS `occupancy_rate`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int DEFAULT NULL,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `test_id` int NOT NULL,
  `order_date` datetime NOT NULL,
  `status` enum('ORDERED','SAMPLE_COLLECTED','PROCESSING','COMPLETED','CANCELLED') DEFAULT 'ORDERED',
  `priority` enum('NORMAL','URGENT','STAT') DEFAULT 'NORMAL',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `test_id` (`test_id`),
  KEY `idx_lab_orders_patient_status` (`patient_id`,`status`),
  CONSTRAINT `lab_orders_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`consultation_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_orders_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `lab_orders_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `lab_orders_ibfk_4` FOREIGN KEY (`test_id`) REFERENCES `lab_tests` (`test_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_result_attachments` (
  `attachment_id` int NOT NULL AUTO_INCREMENT,
  `result_id` int NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `file_size` int NOT NULL,
  `uploaded_by` int NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attachment_id`),
  UNIQUE KEY `stored_filename` (`stored_filename`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `idx_lab_attachment_result` (`result_id`),
  CONSTRAINT `lab_result_attachments_ibfk_1` FOREIGN KEY (`result_id`) REFERENCES `lab_results` (`result_id`) ON DELETE CASCADE,
  CONSTRAINT `lab_result_attachments_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_results` (
  `result_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `result_value` text NOT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `reference_range` varchar(100) DEFAULT NULL,
  `interpretation` enum('NORMAL','LOW','HIGH','CRITICAL') DEFAULT NULL,
  `result_date` datetime NOT NULL,
  `technician_notes` text,
  `performed_by` int DEFAULT NULL,
  `reviewed_by_doctor` tinyint(1) DEFAULT '0',
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `fk_lab_results_performed_by` (`performed_by`),
  CONSTRAINT `fk_lab_results_performed_by` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_results_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `lab_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lab_tests` (
  `test_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `category` varchar(100) NOT NULL,
  `department_id` int DEFAULT NULL,
  `normal_range` varchar(100) DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `cost` decimal(10,2) NOT NULL,
  PRIMARY KEY (`test_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `lab_tests_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_tests_chk_1` CHECK ((`cost` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medicines` (
  `medicine_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `category` varchar(100) NOT NULL,
  `manufacturer` varchar(150) DEFAULT NULL,
  `stock_quantity` int DEFAULT '0',
  `reorder_level` int NOT NULL DEFAULT '50',
  `unit_price` decimal(10,2) NOT NULL,
  `expiry_date` date NOT NULL,
  `requires_prescription` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`medicine_id`),
  CONSTRAINT `medicines_chk_1` CHECK ((`stock_quantity` >= 0)),
  CONSTRAINT `medicines_chk_2` CHECK ((`unit_price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `before_medicine_stock_update` BEFORE UPDATE ON `medicines` FOR EACH ROW BEGIN
    IF NEW.stock_quantity < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error: Medicine stock cannot be negative.';
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `patient_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `date_of_birth` date NOT NULL,
  `gender` enum('MALE','FEMALE','OTHER') NOT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text,
  `emergency_contact` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`patient_id`),
  KEY `idx_patients_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `pending_bills_view` AS SELECT 
 1 AS `bill_id`,
 1 AS `bill_date`,
 1 AS `patient_name`,
 1 AS `phone`,
 1 AS `total_amount`,
 1 AS `paid_amount`,
 1 AS `balance_due`,
 1 AS `status`*/;
SET character_set_client = @saved_cs_client;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pharmacy_stock_movements` (
  `movement_id` int NOT NULL AUTO_INCREMENT,
  `medicine_id` int NOT NULL,
  `movement_type` enum('RECEIPT','ADJUSTMENT','DISPENSE') NOT NULL,
  `quantity` int NOT NULL,
  `reason` varchar(50) DEFAULT NULL,
  `notes` text,
  `performed_by` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference_id` int DEFAULT NULL,
  PRIMARY KEY (`movement_id`),
  KEY `performed_by` (`performed_by`),
  KEY `idx_stock_movement_medicine` (`medicine_id`),
  CONSTRAINT `pharmacy_stock_movements_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `pharmacy_stock_movements_ibfk_2` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prescription_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `prescription_id` int NOT NULL,
  `medicine_id` int NOT NULL,
  `dosage` varchar(50) NOT NULL,
  `frequency` varchar(50) NOT NULL,
  `duration` varchar(50) NOT NULL,
  `quantity` int NOT NULL,
  `dispensed` tinyint(1) DEFAULT '0',
  `dispensed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`item_id`),
  KEY `prescription_id` (`prescription_id`),
  KEY `medicine_id` (`medicine_id`),
  CONSTRAINT `prescription_items_ibfk_1` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`prescription_id`) ON DELETE CASCADE,
  CONSTRAINT `prescription_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `prescription_items_chk_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `after_prescription_dispense` AFTER UPDATE ON `prescription_items` FOR EACH ROW BEGIN
    IF OLD.dispensed = FALSE AND NEW.dispensed = TRUE THEN
        UPDATE medicines 
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE medicine_id = NEW.medicine_id;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prescriptions` (
  `prescription_id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int DEFAULT NULL,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `prescription_date` datetime NOT NULL,
  `status` enum('CREATED','DISPENSED','PARTIALLY_DISPENSED','CANCELLED') DEFAULT 'CREATED',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`prescription_id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `idx_prescriptions_patient_status` (`patient_id`,`status`),
  CONSTRAINT `prescriptions_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`consultation_id`) ON DELETE CASCADE,
  CONSTRAINT `prescriptions_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `prescriptions_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `surgery_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `procedure_name` varchar(255) NOT NULL,
  `diagnosis` text NOT NULL,
  `priority` enum('ROUTINE','URGENT','EMERGENCY') DEFAULT 'ROUTINE',
  `requested_date` date NOT NULL,
  `status` enum('REQUESTED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'REQUESTED',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  CONSTRAINT `surgery_requests_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE CASCADE,
  CONSTRAINT `surgery_requests_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('ADMIN','DOCTOR','RECEPTIONIST','NURSE','LABORATORY','PHARMACY') NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wards` (
  `ward_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `department_id` int NOT NULL,
  `floor` int NOT NULL,
  `capacity` int NOT NULL,
  `ward_type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`ward_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `wards_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE PROCEDURE `sp_admit_patient`(
    IN p_patient_id INT,
    IN p_doctor_id INT,
    IN p_bed_id INT,
    IN p_department_id INT,
    IN p_diagnosis TEXT
)
BEGIN
    INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, admission_date, status, diagnosis)
    VALUES (p_patient_id, p_doctor_id, p_bed_id, p_department_id, NOW(), 'ACTIVE', p_diagnosis);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE PROCEDURE `sp_allocate_emergency`(IN p_emergency_id INT)
BEGIN
    DECLARE v_severity VARCHAR(20);
    DECLARE v_req_spec VARCHAR(100);
    DECLARE v_req_bed VARCHAR(50);
    DECLARE v_patient_id INT;
    DECLARE v_arrival_time DATETIME;
    
    DECLARE v_best_bed_id INT;
    DECLARE v_bed_dept_id INT;
    DECLARE v_best_doctor_id INT;
    
    DECLARE v_admission_id INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Emergency allocation failed due to an error. Rolled back.';
    END;

    START TRANSACTION;

    -- 1. Get emergency details
    SELECT severity, required_specialization, required_bed_type, patient_id, arrival_time
    INTO v_severity, v_req_spec, v_req_bed, v_patient_id, v_arrival_time
    FROM emergency_cases 
    WHERE emergency_id = p_emergency_id AND status IN ('WAITING', 'TRIAGED')
    FOR UPDATE;
    
    IF v_patient_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Emergency case not found or not waiting.';
    END IF;

    -- 2. Find and lock the best available bed (by requested type)
    SELECT b.bed_id, w.department_id 
    INTO v_best_bed_id, v_bed_dept_id
    FROM beds b
    JOIN wards w ON b.ward_id = w.ward_id
    WHERE b.status = 'AVAILABLE' 
      AND b.bed_type = COALESCE(v_req_bed, b.bed_type)
    ORDER BY b.bed_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_best_bed_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No available bed of required type.';
    END IF;

    -- 3. Find and lock the best available doctor (by workload)
    SELECT doctor_id 
    INTO v_best_doctor_id
    FROM doctors
    WHERE status = 'AVAILABLE'
      AND specialization = COALESCE(v_req_spec, specialization)
      AND current_workload < max_workload
    ORDER BY current_workload ASC, doctor_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_best_doctor_id IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No available doctor for required specialization.';
    END IF;

    -- 4. Create admission record
    INSERT INTO admissions (patient_id, doctor_id, bed_id, department_id, emergency_id, admission_date, status, diagnosis)
    VALUES (v_patient_id, v_best_doctor_id, v_best_bed_id, v_bed_dept_id, p_emergency_id, NOW(), 'ACTIVE', 'Emergency Admission');
    
    SET v_admission_id = LAST_INSERT_ID();

    -- 5. Update emergency case
    UPDATE emergency_cases
    SET status = 'ADMITTED', assigned_doctor_id = v_best_doctor_id, assigned_bed_id = v_best_bed_id
    WHERE emergency_id = p_emergency_id;

    COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE PROCEDURE `sp_discharge_patient`(IN p_admission_id INT)
BEGIN
    UPDATE admissions 
    SET discharge_date = NOW(), status = 'DISCHARGED'
    WHERE admission_id = p_admission_id AND status = 'ACTIVE';
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE PROCEDURE `sp_generate_bill`(IN p_admission_id INT)
BEGIN
    DECLARE v_patient_id INT;
    DECLARE v_bill_id INT;
    DECLARE v_total DECIMAL(12,2) DEFAULT 0;
    
    SELECT patient_id INTO v_patient_id FROM admissions WHERE admission_id = p_admission_id;
    
    INSERT INTO bills (patient_id, admission_id, bill_date, status)
    VALUES (v_patient_id, p_admission_id, NOW(), 'PENDING');
    
    SET v_bill_id = LAST_INSERT_ID();
    
    -- Insert generic consultation fee
    INSERT INTO bill_items (bill_id, description, category, quantity, unit_price, total_price)
    VALUES (v_bill_id, 'Base Consultation Fee', 'CONSULTATION', 1, 500.00, 500.00);
    
    SELECT SUM(total_price) INTO v_total FROM bill_items WHERE bill_id = v_bill_id;
    
    UPDATE bills SET total_amount = v_total WHERE bill_id = v_bill_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE PROCEDURE `sp_get_emergency_queue`()
BEGIN
    SELECT * FROM emergency_queue_view;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50001 DROP VIEW IF EXISTS `available_beds_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `available_beds_view` AS select `b`.`bed_id` AS `bed_id`,`b`.`bed_number` AS `bed_number`,`b`.`floor` AS `floor`,`b`.`bed_type` AS `bed_type`,`b`.`has_ventilator` AS `has_ventilator`,`w`.`name` AS `ward_name`,`d`.`name` AS `department_name` from ((`beds` `b` join `wards` `w` on((`b`.`ward_id` = `w`.`ward_id`))) join `departments` `d` on((`w`.`department_id` = `d`.`department_id`))) where (`b`.`status` = 'AVAILABLE') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `available_doctors_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `available_doctors_view` AS select `doc`.`doctor_id` AS `doctor_id`,`doc`.`name` AS `doctor_name`,`doc`.`specialization` AS `specialization`,`doc`.`phone` AS `phone`,`doc`.`current_workload` AS `current_workload`,`doc`.`max_workload` AS `max_workload`,`dep`.`name` AS `department_name` from (`doctors` `doc` join `departments` `dep` on((`doc`.`department_id` = `dep`.`department_id`))) where ((`doc`.`status` = 'AVAILABLE') and (`doc`.`current_workload` < `doc`.`max_workload`)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `bed_status_summary_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `bed_status_summary_view` AS select `w`.`name` AS `ward_name`,`d`.`name` AS `department_name`,`b`.`bed_type` AS `bed_type`,`b`.`status` AS `status`,count(`b`.`bed_id`) AS `count` from ((`beds` `b` join `wards` `w` on((`b`.`ward_id` = `w`.`ward_id`))) join `departments` `d` on((`w`.`department_id` = `d`.`department_id`))) group by `w`.`name`,`d`.`name`,`b`.`bed_type`,`b`.`status` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `current_admissions_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `current_admissions_view` AS select `a`.`admission_id` AS `admission_id`,`a`.`admission_date` AS `admission_date`,`a`.`diagnosis` AS `diagnosis`,`p`.`name` AS `patient_name`,`p`.`patient_id` AS `patient_id`,`doc`.`name` AS `doctor_name`,`doc`.`doctor_id` AS `doctor_id`,`b`.`bed_number` AS `bed_number`,`b`.`bed_type` AS `bed_type`,`w`.`name` AS `ward_name`,`dep`.`name` AS `department_name` from (((((`admissions` `a` join `patients` `p` on((`a`.`patient_id` = `p`.`patient_id`))) join `doctors` `doc` on((`a`.`doctor_id` = `doc`.`doctor_id`))) join `beds` `b` on((`a`.`bed_id` = `b`.`bed_id`))) join `wards` `w` on((`b`.`ward_id` = `w`.`ward_id`))) join `departments` `dep` on((`a`.`department_id` = `dep`.`department_id`))) where (`a`.`status` = 'ACTIVE') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `doctor_workload_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `doctor_workload_view` AS select `doc`.`doctor_id` AS `doctor_id`,`doc`.`name` AS `name`,`doc`.`specialization` AS `specialization`,`dep`.`name` AS `department`,`doc`.`status` AS `status`,`doc`.`shift` AS `shift`,`doc`.`current_workload` AS `current_workload`,`doc`.`max_workload` AS `max_workload`,(`doc`.`max_workload` - `doc`.`current_workload`) AS `available_capacity` from (`doctors` `doc` join `departments` `dep` on((`doc`.`department_id` = `dep`.`department_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `emergency_queue_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `emergency_queue_view` AS select `e`.`emergency_id` AS `emergency_id`,`e`.`severity` AS `severity`,`e`.`arrival_time` AS `arrival_time`,`e`.`symptoms` AS `symptoms`,`e`.`required_specialization` AS `required_specialization`,`e`.`required_bed_type` AS `required_bed_type`,`e`.`ventilator_required` AS `ventilator_required`,`p`.`name` AS `patient_name`,`a`.`vehicle_number` AS `ambulance_number` from ((`emergency_cases` `e` left join `patients` `p` on((`e`.`patient_id` = `p`.`patient_id`))) left join `ambulances` `a` on((`e`.`ambulance_id` = `a`.`ambulance_id`))) where (`e`.`status` in ('WAITING','TRIAGED')) order by (case `e`.`severity` when 'CRITICAL' then 1 when 'VERY_SERIOUS' then 2 when 'SERIOUS' then 3 when 'MODERATE' then 4 when 'STABLE' then 5 end),`e`.`arrival_time` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `hospital_occupancy_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `hospital_occupancy_view` AS select `beds`.`bed_type` AS `bed_type`,count(0) AS `total_beds`,sum((case when (`beds`.`status` = 'OCCUPIED') then 1 else 0 end)) AS `occupied_beds`,sum((case when (`beds`.`status` = 'AVAILABLE') then 1 else 0 end)) AS `available_beds`,sum((case when (`beds`.`status` in ('MAINTENANCE','RESERVED')) then 1 else 0 end)) AS `unavailable_beds`,round(((sum((case when (`beds`.`status` = 'OCCUPIED') then 1 else 0 end)) / count(0)) * 100),2) AS `occupancy_rate` from `beds` group by `beds`.`bed_type` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `pending_bills_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `pending_bills_view` AS select `b`.`bill_id` AS `bill_id`,`b`.`bill_date` AS `bill_date`,`p`.`name` AS `patient_name`,`p`.`phone` AS `phone`,`b`.`total_amount` AS `total_amount`,`b`.`paid_amount` AS `paid_amount`,(`b`.`total_amount` - `b`.`paid_amount`) AS `balance_due`,`b`.`status` AS `status` from (`bills` `b` join `patients` `p` on((`b`.`patient_id` = `p`.`patient_id`))) where (`b`.`status` in ('PENDING','PARTIAL')) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

