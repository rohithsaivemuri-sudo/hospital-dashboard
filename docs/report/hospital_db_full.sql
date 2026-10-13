-- Smart Hospital Management System: complete MySQL script (schema, constraints, views, triggers,
-- procedures and sample data). Exported from a database built from database/seed.sql and migrations
-- 000-023, the same schema as hospital_db. All people and records in it are made up; every demo
-- account password is the documented demo password.
-- Load with:  mysql -u root -p < hospital_db_full.sql

CREATE DATABASE IF NOT EXISTS hospital_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE hospital_db;

-- MySQL dump 10.13  Distrib 9.7.1, for macos15 (arm64)
--
-- Host: (local)
-- ------------------------------------------------------
-- Server version	9.7.1

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

--
-- Table structure for table `admissions`
--

DROP TABLE IF EXISTS `admissions`;
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
  UNIQUE KEY `uq_admissions_id_patient` (`admission_id`,`patient_id`),
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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admissions`
--

LOCK TABLES `admissions` WRITE;
/*!40000 ALTER TABLE `admissions` DISABLE KEYS */;
INSERT INTO `admissions` VALUES (1,3,1,3,2,NULL,'2026-10-11 19:51:14',NULL,'ACTIVE','Acute Myocardial Infarction','Admitted via emergency','2026-10-13 19:51:14','2026-10-13 19:51:14'),(2,6,8,26,7,NULL,'2026-10-10 19:51:14',NULL,'ACTIVE','Severe Head Injury','Post-operative monitoring','2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,7,8,27,7,NULL,'2026-10-12 19:51:14',NULL,'ACTIVE','Multi-organ failure','Critical - ventilator support','2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,12,6,22,5,NULL,'2026-10-08 19:51:14',NULL,'ACTIVE','Fractured Femur','Traction applied','2026-10-13 19:51:14','2026-10-13 19:51:14'),(5,15,5,14,5,NULL,'2026-10-09 19:51:14',NULL,'ACTIVE','Pneumonia','Antibiotics course','2026-10-13 19:51:14','2026-10-13 19:51:14'),(6,21,1,20,2,NULL,'2026-10-12 19:51:14',NULL,'ACTIVE','Angina Pectoris','Under observation','2026-10-13 19:51:14','2026-10-13 19:51:14'),(7,26,7,24,6,NULL,'2026-10-11 19:51:14',NULL,'ACTIVE','Neonatal Jaundice','Phototherapy','2026-10-13 19:51:14','2026-10-13 19:51:14'),(8,30,8,30,7,NULL,'2026-10-13 13:51:14',NULL,'ACTIVE','Cardiac Arrest - Resuscitated','Ventilator ICU','2026-10-13 19:51:14','2026-10-13 19:51:14'),(9,19,3,33,1,NULL,'2026-10-12 19:51:14',NULL,'ACTIVE','Burns - 30% body','Isolation ward','2026-10-13 19:51:14','2026-10-13 19:51:14'),(10,1,1,1,2,NULL,'2026-09-13 19:51:14','2026-09-18 19:51:14','DISCHARGED','Chest Pain - Observation',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(11,9,5,4,5,NULL,'2026-09-23 19:51:14','2026-09-26 19:51:14','DISCHARGED','Viral Fever',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `admissions` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_admission_insert` AFTER INSERT ON `admissions` FOR EACH ROW BEGIN
    UPDATE beds SET status = 'OCCUPIED' WHERE bed_id = NEW.bed_id;
    -- Workload is the number of ACTIVE admissions; one inserted already discharged does not count.
    IF NEW.status = 'ACTIVE' THEN
        UPDATE doctors SET current_workload = current_workload + 1 WHERE doctor_id = NEW.doctor_id;
    END IF;

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
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_admission_discharge` AFTER UPDATE ON `admissions` FOR EACH ROW BEGIN
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

--
-- Table structure for table `ambulances`
--

DROP TABLE IF EXISTS `ambulances`;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ambulances`
--

LOCK TABLES `ambulances` WRITE;
/*!40000 ALTER TABLE `ambulances` DISABLE KEYS */;
INSERT INTO `ambulances` VALUES (1,'DL-01-AB-1234','Ramesh Kumar','9222000001','AIIMS Junction','AVAILABLE'),(2,'DL-01-CD-5678','Suresh Yadav','9222000002','Connaught Place','AVAILABLE'),(3,'MH-02-EF-9012','Manoj Patil','9222000003','En route from Andheri','EN_ROUTE'),(4,'KA-03-GH-3456','Dinesh Gowda','9222000004','Koramangala','AVAILABLE'),(5,'TN-04-IJ-7890','Shankar Rajan','9222000005','Garage','MAINTENANCE'),(6,'UP-05-KL-2345','Vijay Mishra','9222000006','Sector 15','AVAILABLE');
/*!40000 ALTER TABLE `ambulances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointments`
--

DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `appointment_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` time NOT NULL,
  `status` enum('BOOKED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW') DEFAULT 'BOOKED',
  `reason` text,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`appointment_id`),
  UNIQUE KEY `doctor_id` (`doctor_id`,`appointment_date`,`appointment_time`),
  UNIQUE KEY `uq_appointments_id_patient_doctor` (`appointment_id`,`patient_id`,`doctor_id`),
  KEY `patient_id` (`patient_id`),
  KEY `idx_appointments_doc_date_time` (`doctor_id`,`appointment_date`,`appointment_time`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointments`
--

LOCK TABLES `appointments` WRITE;
/*!40000 ALTER TABLE `appointments` DISABLE KEYS */;
INSERT INTO `appointments` VALUES (1,1,1,'2026-10-13','09:00:00','BOOKED','Routine cardiac checkup',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(2,2,5,'2026-10-13','10:00:00','BOOKED','Fever and body ache',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,4,2,'2026-10-13','10:30:00','CHECKED_IN','Persistent headaches',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,8,1,'2026-10-13','11:00:00','BOOKED','Follow-up ECG review',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(5,9,6,'2026-10-13','09:30:00','COMPLETED','Knee pain evaluation',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(6,10,5,'2026-10-13','14:00:00','BOOKED','Annual physical',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(7,14,2,'2026-10-14','09:00:00','BOOKED','MRI review',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(8,16,1,'2026-10-14','10:00:00','BOOKED','Stress test',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(9,22,7,'2026-10-13','11:30:00','BOOKED','Vaccination',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `appointments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `audit_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `role` varchar(20) DEFAULT NULL,
  `action` varchar(64) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `patient_id` int DEFAULT NULL,
  `outcome` enum('SUCCESS','DENIED') NOT NULL DEFAULT 'SUCCESS',
  `status_code` smallint DEFAULT NULL,
  `method` varchar(10) DEFAULT NULL,
  `path` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_user_created` (`user_id`,`created_at`),
  KEY `idx_audit_patient_created` (`patient_id`,`created_at`),
  KEY `idx_audit_action_created` (`action`,`created_at`),
  KEY `idx_audit_outcome_created` (`outcome`,`created_at`),
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,NULL,NULL,'MIGRATION_BACKFILL','encounters',NULL,NULL,'SUCCESS',NULL,NULL,'002_encounters.sql',NULL,'{\"linked_lab_orders\": 6, \"linked_consultations\": 3, \"linked_prescriptions\": 2, \"encounters_from_appointments\": 2, \"encounters_from_consultations\": 2}','2026-10-13 19:51:15.090'),(2,NULL,NULL,'MIGRATION_SEED','nurse_ward_assignments',NULL,NULL,'SUCCESS',NULL,NULL,'003_nurse_assignments.sql',NULL,'{\"assignments_created\": 2}','2026-10-13 19:51:15.119'),(3,NULL,NULL,'MIGRATION_DATA_FIX','beds',NULL,NULL,'SUCCESS',NULL,NULL,'004_fix_general_ward_a_beds.sql',NULL,'{\"beds_freed\": 3, \"bed_numbers\": [\"GEN-A01\", \"GEN-A04\", \"GEN-A06\"], \"assignment_logs_closed\": 2}','2026-10-13 19:51:15.133'),(4,NULL,NULL,'MIGRATION_DATA_FIX','beds',NULL,NULL,'SUCCESS',NULL,NULL,'005_fix_general_ward_b_beds.sql',NULL,'{\"beds_freed\": 2, \"bed_numbers\": [\"GEN-B02\", \"GEN-B05\"]}','2026-10-13 19:51:15.145'),(5,NULL,NULL,'MIGRATION_BACKFILL','medicine_batches',NULL,NULL,'SUCCESS',NULL,NULL,'006_medicine_batches.sql',NULL,'{\"batches_created\": 22}','2026-10-13 19:51:15.176'),(6,NULL,'MIGRATION','CREATE_PRESCRIPTION','prescription',3,6,'SUCCESS',NULL,'MIGRATION','008_seed_mar_demo.js',NULL,'{\"seed\": \"008_seed_mar_demo\", \"item_count\": 4}','2026-10-13 19:51:15.222'),(7,17,'MIGRATION','DISPENSE_PRESCRIPTION','prescription',3,6,'SUCCESS',NULL,'MIGRATION','008_seed_mar_demo.js',NULL,'{\"to\": \"DISPENSED\", \"from\": \"CREATED\", \"items\": [{\"batches\": [], \"item_id\": 7, \"quantity\": 9, \"medicine_id\": 1}, {\"batches\": [], \"item_id\": 8, \"quantity\": 5, \"medicine_id\": 4}, {\"batches\": [], \"item_id\": 9, \"quantity\": 6, \"medicine_id\": 3}, {\"batches\": [], \"item_id\": 10, \"quantity\": 1, \"medicine_id\": 22}], \"doses_scheduled\": 15}','2026-10-13 19:51:15.229'),(8,NULL,NULL,'MIGRATION_BACKFILL','lab_ranges',NULL,NULL,'SUCCESS',NULL,NULL,'009_lab_reference_ranges.sql',NULL,'{\"results_numeric\": 0, \"tests_with_range\": 3, \"results_with_range\": 0, \"results_marked_manual\": 0, \"tests_with_lower_limit\": 0, \"tests_with_upper_limit\": 1}','2026-10-13 19:51:15.261'),(9,NULL,NULL,'MIGRATION_DATA_FIX','doctors',NULL,NULL,'SUCCESS',NULL,NULL,'020_workload_counts_active_admissions.sql',NULL,'{\"reason\": \"current_workload reset to the number of ACTIVE admissions\", \"changed\": [{\"doctor_id\": 1, \"new_workload\": 2, \"old_workload\": 3}, {\"doctor_id\": 5, \"new_workload\": 1, \"old_workload\": 2}]}','2026-10-13 19:51:15.756');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `audit_logs_no_update` BEFORE UPDATE ON `audit_logs` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: rows cannot be updated';
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
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `audit_logs_no_delete` BEFORE DELETE ON `audit_logs` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: rows cannot be deleted';
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Temporary view structure for view `available_beds_view`
--

DROP TABLE IF EXISTS `available_beds_view`;
/*!50001 DROP VIEW IF EXISTS `available_beds_view`*/;
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

--
-- Temporary view structure for view `available_doctors_view`
--

DROP TABLE IF EXISTS `available_doctors_view`;
/*!50001 DROP VIEW IF EXISTS `available_doctors_view`*/;
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

--
-- Table structure for table `bed_assignment_log`
--

DROP TABLE IF EXISTS `bed_assignment_log`;
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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bed_assignment_log`
--

LOCK TABLES `bed_assignment_log` WRITE;
/*!40000 ALTER TABLE `bed_assignment_log` DISABLE KEYS */;
INSERT INTO `bed_assignment_log` VALUES (1,3,3,1,'2026-10-11 19:51:14',NULL,'ACTIVE'),(2,26,6,2,'2026-10-10 19:51:14',NULL,'ACTIVE'),(3,27,7,3,'2026-10-12 19:51:14',NULL,'ACTIVE'),(4,22,12,4,'2026-10-08 19:51:14',NULL,'ACTIVE'),(5,14,15,5,'2026-10-09 19:51:14',NULL,'ACTIVE'),(6,20,21,6,'2026-10-12 19:51:14',NULL,'ACTIVE'),(7,24,26,7,'2026-10-11 19:51:14',NULL,'ACTIVE'),(8,30,30,8,'2026-10-13 13:51:14',NULL,'ACTIVE'),(9,33,19,9,'2026-10-12 19:51:14',NULL,'ACTIVE'),(10,1,1,10,'2026-09-13 19:51:14','2026-09-18 19:51:14','RELEASED'),(11,4,9,11,'2026-09-23 19:51:14','2026-09-26 19:51:14','RELEASED');
/*!40000 ALTER TABLE `bed_assignment_log` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_bed_assignment_log` AFTER INSERT ON `bed_assignment_log` FOR EACH ROW BEGIN
    -- This trigger is just for demonstration if we want to cascade logs or notify systems.
    -- The actual logging is handled in the after_admission_insert and update triggers.
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Temporary view structure for view `bed_status_summary_view`
--

DROP TABLE IF EXISTS `bed_status_summary_view`;
/*!50001 DROP VIEW IF EXISTS `bed_status_summary_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `bed_status_summary_view` AS SELECT 
 1 AS `ward_name`,
 1 AS `department_name`,
 1 AS `bed_type`,
 1 AS `status`,
 1 AS `count`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `beds`
--

DROP TABLE IF EXISTS `beds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beds` (
  `bed_id` int NOT NULL AUTO_INCREMENT,
  `ward_id` int NOT NULL,
  `bed_number` varchar(20) NOT NULL,
  `bed_type` enum('GENERAL','ICU','NICU','ISOLATION','VENTILATOR_ICU') NOT NULL,
  `status` enum('AVAILABLE','OCCUPIED','MAINTENANCE','RESERVED') DEFAULT 'AVAILABLE',
  `has_ventilator` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`bed_id`),
  UNIQUE KEY `ward_id` (`ward_id`,`bed_number`),
  KEY `idx_beds_status_type` (`status`,`bed_type`),
  KEY `idx_beds_ward_status` (`ward_id`,`status`),
  CONSTRAINT `beds_ibfk_1` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`ward_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `beds`
--

LOCK TABLES `beds` WRITE;
/*!40000 ALTER TABLE `beds` DISABLE KEYS */;
INSERT INTO `beds` VALUES (1,1,'GEN-A01','GENERAL','AVAILABLE',0),(2,1,'GEN-A02','GENERAL','AVAILABLE',0),(3,1,'GEN-A03','GENERAL','OCCUPIED',0),(4,1,'GEN-A04','GENERAL','AVAILABLE',0),(5,1,'GEN-A05','GENERAL','AVAILABLE',0),(6,1,'GEN-A06','GENERAL','AVAILABLE',0),(7,1,'GEN-A07','GENERAL','AVAILABLE',0),(8,1,'GEN-A08','GENERAL','MAINTENANCE',0),(9,1,'GEN-A09','GENERAL','AVAILABLE',0),(10,1,'GEN-A10','GENERAL','AVAILABLE',0),(11,2,'GEN-B01','GENERAL','AVAILABLE',0),(12,2,'GEN-B02','GENERAL','AVAILABLE',0),(13,2,'GEN-B03','GENERAL','AVAILABLE',0),(14,2,'GEN-B04','GENERAL','OCCUPIED',0),(15,2,'GEN-B05','GENERAL','AVAILABLE',0),(16,2,'GEN-B06','GENERAL','AVAILABLE',0),(17,2,'GEN-B07','GENERAL','AVAILABLE',0),(18,2,'GEN-B08','GENERAL','AVAILABLE',0),(19,3,'CARD-01','GENERAL','AVAILABLE',0),(20,3,'CARD-02','GENERAL','OCCUPIED',0),(21,3,'CARD-03','GENERAL','AVAILABLE',0),(22,3,'CARD-04','GENERAL','OCCUPIED',0),(23,4,'NICU-01','NICU','AVAILABLE',1),(24,4,'NICU-02','NICU','OCCUPIED',0),(25,4,'NICU-03','NICU','AVAILABLE',1),(26,5,'ICU-01','ICU','OCCUPIED',1),(27,5,'ICU-02','ICU','OCCUPIED',1),(28,5,'ICU-03','ICU','MAINTENANCE',1),(29,5,'ICU-04','ICU','AVAILABLE',1),(30,5,'VICU-01','VENTILATOR_ICU','OCCUPIED',1),(31,5,'VICU-02','VENTILATOR_ICU','AVAILABLE',1),(32,6,'ISO-01','ISOLATION','AVAILABLE',0),(33,6,'ISO-02','ISOLATION','OCCUPIED',0),(34,6,'ISO-03','ISOLATION','AVAILABLE',0),(35,6,'ISO-04','ISOLATION','AVAILABLE',0);
/*!40000 ALTER TABLE `beds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bill_items`
--

DROP TABLE IF EXISTS `bill_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bill_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `description` varchar(255) NOT NULL,
  `category` enum('CONSULTATION','BED','ICU','LABORATORY','MEDICINE','PROCEDURE','AMBULANCE','OTHER') NOT NULL,
  `quantity` int DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) VIRTUAL NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_id`),
  KEY `bill_id` (`bill_id`),
  CONSTRAINT `bill_items_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`bill_id`) ON DELETE CASCADE,
  CONSTRAINT `bill_items_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `bill_items_chk_2` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `bill_items_chk_3` CHECK ((`total_price` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bill_items`
--

LOCK TABLES `bill_items` WRITE;
/*!40000 ALTER TABLE `bill_items` DISABLE KEYS */;
INSERT INTO `bill_items` (`item_id`, `bill_id`, `description`, `category`, `quantity`, `unit_price`, `created_at`) VALUES (1,1,'ICU Bed Charges (2 days)','ICU',2,15000.00,'2026-10-13 19:51:14'),(2,1,'Emergency PCI Procedure','PROCEDURE',1,75000.00,'2026-10-13 19:51:14'),(3,1,'Cardiologist Consultation','CONSULTATION',1,2000.00,'2026-10-13 19:51:14'),(4,1,'ECG','LABORATORY',1,300.00,'2026-10-13 19:51:14'),(5,1,'Troponin I Test','LABORATORY',1,1200.00,'2026-10-13 19:51:14'),(6,1,'Lipid Profile','LABORATORY',1,800.00,'2026-10-13 19:51:14'),(7,1,'Medications (Aspirin, Clopidogrel, etc.)','MEDICINE',1,15700.00,'2026-10-13 19:51:14'),(8,2,'ICU Bed Charges (1 day)','ICU',1,15000.00,'2026-10-13 19:51:14'),(9,2,'Emergency Surgery','PROCEDURE',1,60000.00,'2026-10-13 19:51:14'),(10,2,'CT Scan Head','LABORATORY',1,3500.00,'2026-10-13 19:51:14'),(11,2,'CBC','LABORATORY',1,400.00,'2026-10-13 19:51:14'),(12,2,'Intensivist Consultation','CONSULTATION',2,2000.00,'2026-10-13 19:51:14'),(13,2,'Medications','MEDICINE',1,2100.00,'2026-10-13 19:51:14'),(14,3,'General Bed Charges (5 days)','BED',5,3000.00,'2026-10-13 19:51:14'),(15,3,'Orthopedic Consultation','CONSULTATION',2,1500.00,'2026-10-13 19:51:14'),(16,3,'X-Ray','LABORATORY',2,600.00,'2026-10-13 19:51:14'),(17,3,'Medications & Cast','MEDICINE',1,15800.00,'2026-10-13 19:51:14'),(18,4,'OPD Consultation','CONSULTATION',1,800.00,'2026-10-13 19:51:14'),(19,4,'Medications','MEDICINE',1,700.00,'2026-10-13 19:51:14');
/*!40000 ALTER TABLE `bill_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bills`
--

DROP TABLE IF EXISTS `bills`;
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
  KEY `idx_bills_patient_status` (`patient_id`,`status`),
  KEY `fk_ctx_bills_admission` (`admission_id`,`patient_id`),
  CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `bills_ibfk_2` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ctx_bills_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `bills_chk_1` CHECK ((`total_amount` >= 0)),
  CONSTRAINT `bills_chk_2` CHECK (((`paid_amount` >= 0) and (`paid_amount` <= `total_amount`)))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bills`
--

LOCK TABLES `bills` WRITE;
/*!40000 ALTER TABLE `bills` DISABLE KEYS */;
INSERT INTO `bills` VALUES (1,3,1,'2026-10-11 19:51:14',125000.00,50000.00,'PARTIAL','UPI',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(2,7,3,'2026-10-12 19:51:14',85000.00,0.00,'PENDING',NULL,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,12,4,'2026-10-08 19:51:14',35000.00,35000.00,'PAID','Card',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,9,NULL,'2026-10-13 19:51:14',1500.00,1500.00,'PAID','Cash',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `bills` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `consultations`
--

DROP TABLE IF EXISTS `consultations`;
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
  `encounter_id` int DEFAULT NULL,
  PRIMARY KEY (`consultation_id`),
  UNIQUE KEY `uq_consultations_id_patient` (`consultation_id`,`patient_id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `idx_consultations_encounter` (`encounter_id`),
  KEY `fk_ctx_consultations_encounter` (`encounter_id`,`patient_id`,`doctor_id`),
  KEY `fk_ctx_consultations_appointment` (`appointment_id`,`patient_id`,`doctor_id`),
  KEY `fk_ctx_consultations_admission` (`admission_id`,`patient_id`),
  CONSTRAINT `consultations_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE SET NULL,
  CONSTRAINT `consultations_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `consultations_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `consultations_ibfk_4` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_consultations_encounter` FOREIGN KEY (`encounter_id`) REFERENCES `encounters` (`encounter_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_consultations_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_consultations_appointment` FOREIGN KEY (`appointment_id`, `patient_id`, `doctor_id`) REFERENCES `appointments` (`appointment_id`, `patient_id`, `doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_consultations_encounter` FOREIGN KEY (`encounter_id`, `patient_id`, `doctor_id`) REFERENCES `encounters` (`encounter_id`, `patient_id`, `doctor_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consultations`
--

LOCK TABLES `consultations` WRITE;
/*!40000 ALTER TABLE `consultations` DISABLE KEYS */;
INSERT INTO `consultations` VALUES (1,5,9,6,NULL,'Pain in left knee, swelling for 2 weeks','Mild osteoarthritis',NULL,NULL,'Prescribed NSAIDs, physiotherapy recommended','2026-10-13 17:51:14','2026-10-13 19:51:14',2),(2,NULL,3,1,1,'Severe chest pain radiating to left arm','Acute MI - STEMI',NULL,NULL,'Emergency PCI performed, stent placed','2026-10-11 19:51:14','2026-10-13 19:51:14',4),(3,NULL,7,8,3,'Unconscious, multiple fractures, internal bleeding','Polytrauma',NULL,NULL,'Emergency surgery completed, on ventilator','2026-10-12 19:51:14','2026-10-13 19:51:14',5);
/*!40000 ALTER TABLE `consultations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `current_admissions_view`
--

DROP TABLE IF EXISTS `current_admissions_view`;
/*!50001 DROP VIEW IF EXISTS `current_admissions_view`*/;
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

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'Emergency','Trauma and immediate care',1,'ext-100',1),(2,'Cardiology','Heart and cardiovascular care',2,'ext-200',1),(3,'Neurology','Brain and nervous system',3,'ext-300',1),(4,'Orthopedics','Bones, joints, and musculoskeletal',2,'ext-201',1),(5,'General Medicine','Internal medicine and primary care',1,'ext-101',1),(6,'Pediatrics','Children healthcare',1,'ext-102',1),(7,'ICU','Intensive Care Unit - Critical care',3,'ext-301',1),(8,'Radiology','Medical imaging and diagnostics',0,'ext-001',1),(9,'Pathology','Laboratory and diagnostic testing',0,'ext-002',1);
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctor_daily_analytics`
--

DROP TABLE IF EXISTS `doctor_daily_analytics`;
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

--
-- Dumping data for table `doctor_daily_analytics`
--

LOCK TABLES `doctor_daily_analytics` WRITE;
/*!40000 ALTER TABLE `doctor_daily_analytics` DISABLE KEYS */;
/*!40000 ALTER TABLE `doctor_daily_analytics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctor_schedules`
--

DROP TABLE IF EXISTS `doctor_schedules`;
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
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctor_schedules`
--

LOCK TABLES `doctor_schedules` WRITE;
/*!40000 ALTER TABLE `doctor_schedules` DISABLE KEYS */;
INSERT INTO `doctor_schedules` VALUES (1,1,'MONDAY','08:00:00','14:00:00',1),(2,1,'TUESDAY','08:00:00','14:00:00',1),(3,1,'WEDNESDAY','08:00:00','14:00:00',1),(4,1,'THURSDAY','08:00:00','14:00:00',1),(5,1,'FRIDAY','08:00:00','14:00:00',1),(6,2,'MONDAY','08:00:00','14:00:00',1),(7,2,'TUESDAY','08:00:00','14:00:00',1),(8,2,'WEDNESDAY','08:00:00','14:00:00',1),(9,3,'MONDAY','06:00:00','14:00:00',1),(10,3,'TUESDAY','06:00:00','14:00:00',1),(11,3,'WEDNESDAY','06:00:00','14:00:00',1),(12,3,'THURSDAY','06:00:00','14:00:00',1),(13,3,'FRIDAY','06:00:00','14:00:00',1),(14,4,'MONDAY','14:00:00','22:00:00',1),(15,4,'WEDNESDAY','14:00:00','22:00:00',1),(16,4,'FRIDAY','14:00:00','22:00:00',1),(17,5,'MONDAY','08:00:00','16:00:00',1),(18,5,'TUESDAY','08:00:00','16:00:00',1),(19,5,'THURSDAY','08:00:00','16:00:00',1),(20,6,'MONDAY','14:00:00','22:00:00',1),(21,6,'TUESDAY','14:00:00','22:00:00',1),(22,6,'WEDNESDAY','14:00:00','22:00:00',1),(23,7,'MONDAY','22:00:00','06:00:00',1),(24,7,'WEDNESDAY','22:00:00','06:00:00',1),(25,7,'FRIDAY','22:00:00','06:00:00',1),(26,8,'MONDAY','14:00:00','22:00:00',1),(27,8,'TUESDAY','14:00:00','22:00:00',1),(28,9,'TUESDAY','08:00:00','14:00:00',1),(29,9,'THURSDAY','08:00:00','14:00:00',1),(30,10,'MONDAY','08:00:00','14:00:00',1),(31,10,'WEDNESDAY','08:00:00','14:00:00',1),(32,11,'MONDAY','08:00:00','16:00:00',1),(33,11,'TUESDAY','08:00:00','16:00:00',1),(34,12,'MONDAY','08:00:00','14:00:00',1),(35,12,'TUESDAY','08:00:00','14:00:00',1),(36,12,'WEDNESDAY','08:00:00','14:00:00',1);
/*!40000 ALTER TABLE `doctor_schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `doctor_workload_view`
--

DROP TABLE IF EXISTS `doctor_workload_view`;
/*!50001 DROP VIEW IF EXISTS `doctor_workload_view`*/;
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

--
-- Table structure for table `doctors`
--

DROP TABLE IF EXISTS `doctors`;
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
  UNIQUE KEY `uq_doctors_user_id` (`user_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_doctors_spec_status` (`specialization`,`status`),
  CONSTRAINT `doctors_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `doctors_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `doctors_chk_1` CHECK (((`current_workload` <= `max_workload`) and (`current_workload` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctors`
--

LOCK TABLES `doctors` WRITE;
/*!40000 ALTER TABLE `doctors` DISABLE KEYS */;
INSERT INTO `doctors` VALUES (1,2,2,'Dr. John Smith','Cardiology','9876543210','AVAILABLE','MORNING',2,5,'2026-10-13 19:51:14','2026-10-13 19:51:15'),(2,3,3,'Dr. Priya Patel','Neurology','9876543211','AVAILABLE','MORNING',0,5,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,4,1,'Dr. Rajesh Kumar','Emergency Medicine','9876543212','AVAILABLE','MORNING',1,8,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,5,5,'Dr. Anita Gupta','General Medicine','9876543213','AVAILABLE','AFTERNOON',0,5,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(5,6,4,'Dr. Vikram Sharma','Orthopedics','9876543214','AVAILABLE','MORNING',1,5,'2026-10-13 19:51:14','2026-10-13 19:51:15'),(6,7,6,'Dr. Lakshmi Reddy','Pediatrics','9876543215','AVAILABLE','AFTERNOON',1,6,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(7,8,7,'Dr. Arjun Singh','Critical Care','9876543216','AVAILABLE','NIGHT',1,4,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(8,9,2,'Dr. Neha Mehta','Cardiology','9876543217','AVAILABLE','AFTERNOON',3,5,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(9,10,1,'Dr. Sunil Joshi','Emergency Medicine','9876543218','AVAILABLE','NIGHT',0,8,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(10,11,3,'Dr. Kavitha Rao','Neurology','9876543219','OFF_DUTY','MORNING',0,5,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(11,12,5,'Dr. Amit Das','General Medicine','9876543220','AVAILABLE','MORNING',0,5,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(12,13,7,'Dr. Ritu Agarwal','Critical Care','9876543221','AVAILABLE','MORNING',0,4,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `doctors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `emergency_cases`
--

DROP TABLE IF EXISTS `emergency_cases`;
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `emergency_cases`
--

LOCK TABLES `emergency_cases` WRITE;
/*!40000 ALTER TABLE `emergency_cases` DISABLE KEYS */;
INSERT INTO `emergency_cases` VALUES (1,5,1,'CRITICAL','Chest pain, shortness of breath, sweating','2026-10-13 19:21:14','Cardiology','ICU',1,'WAITING',NULL,NULL,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(2,11,3,'VERY_SERIOUS','Severe head trauma, loss of consciousness','2026-10-13 19:31:14','Neurology','ICU',0,'WAITING',NULL,NULL,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,17,NULL,'SERIOUS','Compound fracture of right leg','2026-10-13 19:06:14','Orthopedics','GENERAL',0,'WAITING',NULL,NULL,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,23,2,'MODERATE','High fever, dehydration, disorientation','2026-10-13 18:51:14','General Medicine','GENERAL',0,'WAITING',NULL,NULL,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(5,7,4,'CRITICAL','Multi-organ failure after accident','2026-10-12 19:51:14','Critical Care','ICU',1,'ALLOCATED',8,30,NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `emergency_cases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `emergency_queue_view`
--

DROP TABLE IF EXISTS `emergency_queue_view`;
/*!50001 DROP VIEW IF EXISTS `emergency_queue_view`*/;
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

--
-- Table structure for table `encounters`
--

DROP TABLE IF EXISTS `encounters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `encounters` (
  `encounter_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `appointment_id` int DEFAULT NULL,
  `admission_id` int DEFAULT NULL,
  `encounter_type` enum('OUTPATIENT','INPATIENT','EMERGENCY') NOT NULL DEFAULT 'OUTPATIENT',
  `status` enum('PLANNED','ARRIVED','TRIAGED','IN_PROGRESS','FINISHED','CANCELLED','ENTERED_IN_ERROR') NOT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `triaged_at` datetime DEFAULT NULL,
  `start_timestamp` datetime DEFAULT NULL,
  `end_timestamp` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `backfilled_from` varchar(40) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`encounter_id`),
  UNIQUE KEY `uq_encounters_id_patient_doctor` (`encounter_id`,`patient_id`,`doctor_id`),
  UNIQUE KEY `uq_encounters_id_patient` (`encounter_id`,`patient_id`),
  UNIQUE KEY `uq_encounters_appointment` (`appointment_id`),
  UNIQUE KEY `uq_encounters_backfilled_from` (`backfilled_from`),
  KEY `idx_encounters_doctor_status` (`doctor_id`,`status`),
  KEY `idx_encounters_patient_status` (`patient_id`,`status`),
  KEY `idx_encounters_admission` (`admission_id`),
  KEY `fk_encounters_created_by` (`created_by`),
  KEY `fk_ctx_encounters_admission` (`admission_id`,`patient_id`),
  CONSTRAINT `fk_ctx_encounters_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_encounters_admission` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_encounters_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_encounters_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_encounters_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_encounters_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_encounters_times` CHECK (((`end_timestamp` is null) or (`start_timestamp` is null) or (`end_timestamp` >= `start_timestamp`)))
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `encounters`
--

LOCK TABLES `encounters` WRITE;
/*!40000 ALTER TABLE `encounters` DISABLE KEYS */;
INSERT INTO `encounters` VALUES (1,4,2,3,NULL,'OUTPATIENT','ARRIVED','2026-10-13 19:51:14',NULL,NULL,NULL,NULL,'appointment:3','2026-10-13 19:51:15','2026-10-13 19:51:15'),(2,9,6,5,NULL,'OUTPATIENT','FINISHED','2026-10-13 17:51:14',NULL,'2026-10-13 17:51:14','2026-10-13 19:51:14',NULL,'appointment:5','2026-10-13 19:51:15','2026-10-13 19:51:15'),(4,3,1,NULL,1,'INPATIENT','FINISHED','2026-10-11 19:51:14',NULL,'2026-10-11 19:51:14','2026-10-11 19:51:14',NULL,'consultation:2','2026-10-13 19:51:15','2026-10-13 19:51:15'),(5,7,8,NULL,3,'INPATIENT','FINISHED','2026-10-12 19:51:14',NULL,'2026-10-12 19:51:14','2026-10-12 19:51:14',NULL,'consultation:3','2026-10-13 19:51:15','2026-10-13 19:51:15');
/*!40000 ALTER TABLE `encounters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `hospital_occupancy_view`
--

DROP TABLE IF EXISTS `hospital_occupancy_view`;
/*!50001 DROP VIEW IF EXISTS `hospital_occupancy_view`*/;
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

--
-- Table structure for table `lab_orders`
--

DROP TABLE IF EXISTS `lab_orders`;
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
  `encounter_id` int DEFAULT NULL,
  `admission_id` int DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `test_id` (`test_id`),
  KEY `idx_lab_orders_patient_status` (`patient_id`,`status`),
  KEY `idx_lab_orders_encounter` (`encounter_id`),
  KEY `idx_lab_orders_admission` (`admission_id`),
  KEY `fk_ctx_lab_orders_encounter` (`encounter_id`,`patient_id`,`doctor_id`),
  KEY `fk_ctx_lab_orders_admission` (`admission_id`,`patient_id`),
  KEY `fk_ctx_lab_orders_consultation` (`consultation_id`,`patient_id`),
  CONSTRAINT `fk_ctx_lab_orders_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_lab_orders_consultation` FOREIGN KEY (`consultation_id`, `patient_id`) REFERENCES `consultations` (`consultation_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_lab_orders_encounter` FOREIGN KEY (`encounter_id`, `patient_id`, `doctor_id`) REFERENCES `encounters` (`encounter_id`, `patient_id`, `doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lab_orders_admission` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lab_orders_encounter` FOREIGN KEY (`encounter_id`) REFERENCES `encounters` (`encounter_id`) ON DELETE RESTRICT,
  CONSTRAINT `lab_orders_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`consultation_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_orders_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `lab_orders_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `lab_orders_ibfk_4` FOREIGN KEY (`test_id`) REFERENCES `lab_tests` (`test_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lab_orders`
--

LOCK TABLES `lab_orders` WRITE;
/*!40000 ALTER TABLE `lab_orders` DISABLE KEYS */;
INSERT INTO `lab_orders` VALUES (1,2,3,1,11,'2026-10-11 19:51:14','COMPLETED','STAT',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',4,NULL),(2,2,3,1,15,'2026-10-11 19:51:14','COMPLETED','STAT',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',4,NULL),(3,2,3,1,2,'2026-10-11 19:51:14','COMPLETED','URGENT',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',4,NULL),(4,3,7,8,1,'2026-10-12 19:51:14','PROCESSING','STAT',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',5,NULL),(5,3,7,8,9,'2026-10-12 19:51:14','COMPLETED','STAT',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',5,NULL),(6,1,9,6,1,'2026-10-13 19:51:14','ORDERED','NORMAL',NULL,'2026-10-13 19:51:14','2026-10-13 19:51:14',2,NULL);
/*!40000 ALTER TABLE `lab_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lab_result_attachments`
--

DROP TABLE IF EXISTS `lab_result_attachments`;
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

--
-- Dumping data for table `lab_result_attachments`
--

LOCK TABLES `lab_result_attachments` WRITE;
/*!40000 ALTER TABLE `lab_result_attachments` DISABLE KEYS */;
/*!40000 ALTER TABLE `lab_result_attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lab_results`
--

DROP TABLE IF EXISTS `lab_results`;
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
  `numeric_value` decimal(14,4) DEFAULT NULL,
  `reference_low` decimal(14,4) DEFAULT NULL,
  `reference_high` decimal(14,4) DEFAULT NULL,
  `interpretation_source` enum('AUTO','MANUAL') DEFAULT NULL,
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `fk_lab_results_performed_by` (`performed_by`),
  CONSTRAINT `fk_lab_results_performed_by` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_results_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `lab_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lab_results`
--

LOCK TABLES `lab_results` WRITE;
/*!40000 ALTER TABLE `lab_results` DISABLE KEYS */;
INSERT INTO `lab_results` VALUES (1,1,'Normal Sinus Rhythm, ST elevation in V1-V4',NULL,NULL,NULL,'2026-10-11 19:51:14','Urgent findings communicated',NULL,1,'2026-10-11 19:51:14','2026-10-13 19:51:14',NULL,NULL,NULL,NULL),(2,2,'Troponin I: 2.8 ng/mL (ELEVATED)',NULL,NULL,NULL,'2026-10-11 19:51:14','Significantly elevated, consistent with MI',NULL,1,'2026-10-11 19:51:14','2026-10-13 19:51:14',NULL,NULL,NULL,NULL),(3,3,'Total Cholesterol: 245, LDL: 160, HDL: 38, Triglycerides: 220',NULL,NULL,NULL,'2026-10-11 19:51:14','Dyslipidemia noted',NULL,1,'2026-10-11 19:51:14','2026-10-13 19:51:14',NULL,NULL,NULL,NULL),(4,5,'No midline shift, subdural hematoma left temporal region',NULL,NULL,NULL,'2026-10-12 19:51:14','Neurosurgery consultation recommended',NULL,1,'2026-10-12 19:51:14','2026-10-13 19:51:14',NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `lab_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lab_tests`
--

DROP TABLE IF EXISTS `lab_tests`;
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
  `reference_low` decimal(14,4) DEFAULT NULL,
  `reference_high` decimal(14,4) DEFAULT NULL,
  `critical_low` decimal(14,4) DEFAULT NULL,
  `critical_high` decimal(14,4) DEFAULT NULL,
  PRIMARY KEY (`test_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `lab_tests_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL,
  CONSTRAINT `lab_tests_chk_1` CHECK ((`cost` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lab_tests`
--

LOCK TABLES `lab_tests` WRITE;
/*!40000 ALTER TABLE `lab_tests` DISABLE KEYS */;
INSERT INTO `lab_tests` VALUES (1,'Complete Blood Count (CBC)','Hematology',9,'4500-11000','cells/mcL',400.00,4500.0000,11000.0000,NULL,NULL),(2,'Lipid Profile','Biochemistry',9,'Varies','mg/dL',800.00,NULL,NULL,NULL,NULL),(3,'Liver Function Test (LFT)','Biochemistry',9,'Varies','U/L',650.00,NULL,NULL,NULL,NULL),(4,'Kidney Function Test (KFT)','Biochemistry',9,'Varies','mg/dL',700.00,NULL,NULL,NULL,NULL),(5,'Blood Glucose Fasting','Biochemistry',9,'70-100','mg/dL',150.00,70.0000,100.0000,NULL,NULL),(6,'HbA1c','Biochemistry',9,'4.0-5.6','%',550.00,4.0000,5.6000,NULL,NULL),(7,'Thyroid Profile (T3, T4, TSH)','Endocrine',9,'Varies','Various',750.00,NULL,NULL,NULL,NULL),(8,'Chest X-Ray','Radiology',8,'Normal','N/A',600.00,NULL,NULL,NULL,NULL),(9,'CT Scan - Head','Radiology',8,'Normal','N/A',3500.00,NULL,NULL,NULL,NULL),(10,'MRI - Brain','Radiology',8,'Normal','N/A',8500.00,NULL,NULL,NULL,NULL),(11,'ECG','Cardiology',2,'Normal Sinus Rhythm','N/A',300.00,NULL,NULL,NULL,NULL),(12,'Echocardiography','Cardiology',2,'EF > 55%','%',2500.00,NULL,NULL,NULL,NULL),(13,'Urine Routine','Pathology',9,'Normal','N/A',200.00,NULL,NULL,NULL,NULL),(14,'Blood Culture','Microbiology',9,'No growth','N/A',800.00,NULL,NULL,NULL,NULL),(15,'Troponin I','Cardiology',2,'<0.04','ng/mL',1200.00,NULL,0.0400,NULL,NULL);
/*!40000 ALTER TABLE `lab_tests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medication_administrations`
--

DROP TABLE IF EXISTS `medication_administrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medication_administrations` (
  `administration_id` int NOT NULL AUTO_INCREMENT,
  `prescription_item_id` int NOT NULL,
  `admission_id` int DEFAULT NULL,
  `scheduled_at_utc` datetime DEFAULT NULL,
  `status` enum('PENDING','ADMINISTERED','REFUSED','MISSED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `administered_at_utc` datetime DEFAULT NULL,
  `dose_given` varchar(50) DEFAULT NULL,
  `route_given` enum('ORAL','IV','IM','SC','SUBLINGUAL','INHALED','TOPICAL','RECTAL','OTHER') DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `recorded_by` int DEFAULT NULL,
  `recorded_at_utc` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`administration_id`),
  UNIQUE KEY `uq_mar_item_slot` (`prescription_item_id`,`scheduled_at_utc`),
  KEY `idx_mar_admission_status` (`admission_id`,`status`),
  KEY `fk_mar_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_mar_admission` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mar_item` FOREIGN KEY (`prescription_item_id`) REFERENCES `prescription_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mar_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_mar_given` CHECK (((`status` <> _utf8mb4'ADMINISTERED') or (`administered_at_utc` is not null)))
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_administrations`
--

LOCK TABLES `medication_administrations` WRITE;
/*!40000 ALTER TABLE `medication_administrations` DISABLE KEYS */;
INSERT INTO `medication_administrations` VALUES (1,7,2,'2026-10-13 14:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(2,7,2,'2026-10-14 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(3,7,2,'2026-10-14 08:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(4,7,2,'2026-10-14 14:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(5,7,2,'2026-10-15 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(6,7,2,'2026-10-15 08:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(7,7,2,'2026-10-15 14:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(8,7,2,'2026-10-16 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(9,7,2,'2026-10-16 08:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(10,8,2,'2026-10-14 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(11,8,2,'2026-10-15 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(12,8,2,'2026-10-16 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(13,8,2,'2026-10-17 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(14,8,2,'2026-10-18 02:30:00','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(15,10,2,'2026-10-13 14:21:15','PENDING',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15');
/*!40000 ALTER TABLE `medication_administrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medicine_batches`
--

DROP TABLE IF EXISTS `medicine_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medicine_batches` (
  `batch_id` int NOT NULL AUTO_INCREMENT,
  `medicine_id` int NOT NULL,
  `batch_number` varchar(50) NOT NULL,
  `quantity` int NOT NULL,
  `expiry_date` date NOT NULL,
  `received_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `received_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `uq_medicine_batches_number` (`medicine_id`,`batch_number`),
  UNIQUE KEY `uq_medicine_batches_id_medicine` (`batch_id`,`medicine_id`),
  KEY `idx_medicine_batches_fefo` (`medicine_id`,`expiry_date`,`batch_id`),
  KEY `fk_medicine_batches_received_by` (`received_by`),
  CONSTRAINT `fk_medicine_batches_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_medicine_batches_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_medicine_batches_quantity` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medicine_batches`
--

LOCK TABLES `medicine_batches` WRITE;
/*!40000 ALTER TABLE `medicine_batches` DISABLE KEYS */;
INSERT INTO `medicine_batches` VALUES (1,1,'LEGACY-1',991,'2027-12-31','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(2,2,'LEGACY-2',500,'2027-06-30','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(3,3,'LEGACY-3',794,'2027-09-30','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(4,4,'LEGACY-4',295,'2028-01-15','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(5,5,'LEGACY-5',1500,'2027-08-01','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(6,6,'LEGACY-6',600,'2027-11-20','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(7,7,'LEGACY-7',400,'2027-03-10','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(8,8,'LEGACY-8',900,'2028-08-05','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(9,9,'LEGACY-9',200,'2027-12-01','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(10,10,'LEGACY-10',450,'2027-05-15','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(11,11,'LEGACY-11',350,'2028-02-28','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(12,12,'LEGACY-12',250,'2027-07-20','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(13,13,'LEGACY-13',320,'2027-10-15','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(14,14,'LEGACY-14',280,'2028-04-30','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(15,15,'LEGACY-15',100,'2027-06-15','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(16,16,'LEGACY-16',500,'2028-01-20','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(17,17,'LEGACY-17',150,'2027-09-10','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(18,18,'LEGACY-18',400,'2027-11-30','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(19,19,'LEGACY-19',300,'2027-08-25','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(20,20,'LEGACY-20',200,'2028-03-15','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(21,21,'LEGACY-21',50,'2027-04-20','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(22,22,'LEGACY-22',79,'2027-07-10','2026-10-13 19:51:14',NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15');
/*!40000 ALTER TABLE `medicine_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medicines`
--

DROP TABLE IF EXISTS `medicines`;
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
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medicines`
--

LOCK TABLES `medicines` WRITE;
/*!40000 ALTER TABLE `medicines` DISABLE KEYS */;
INSERT INTO `medicines` VALUES (1,'Paracetamol 500mg','Analgesic','Cipla',991,50,5.00,'2027-12-31',0,'2026-10-13 19:51:14','2026-10-13 19:51:15'),(2,'Amoxicillin 250mg','Antibiotic','Sun Pharma',500,50,15.00,'2027-06-30',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,'Ibuprofen 400mg','NSAID','Dr. Reddys',794,50,8.00,'2027-09-30',0,'2026-10-13 19:51:14','2026-10-13 19:51:15'),(4,'Omeprazole 20mg','Antacid','Cipla',295,50,12.00,'2028-01-15',1,'2026-10-13 19:51:14','2026-10-13 19:51:15'),(5,'Aspirin 75mg','Antiplatelet','Bayer',1500,50,3.00,'2027-08-01',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(6,'Metformin 500mg','Antidiabetic','USV',600,50,6.00,'2027-11-20',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(7,'Amlodipine 5mg','Antihypertensive','Pfizer',400,50,7.50,'2027-03-10',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(8,'Cetirizine 10mg','Antihistamine','Glenmark',900,50,4.00,'2028-08-05',0,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(9,'Azithromycin 500mg','Antibiotic','Zydus',200,50,25.00,'2027-12-01',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(10,'Pantoprazole 40mg','Antacid','Alkem',450,50,14.00,'2027-05-15',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(11,'Atorvastatin 10mg','Statin','Ranbaxy',350,50,10.00,'2028-02-28',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(12,'Clopidogrel 75mg','Antiplatelet','Sun Pharma',250,50,18.00,'2027-07-20',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(13,'Metoprolol 50mg','Beta Blocker','AstraZeneca',320,50,12.00,'2027-10-15',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(14,'Losartan 50mg','ARB','Torrent',280,50,9.00,'2028-04-30',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(15,'Insulin Glargine','Insulin','Sanofi',100,50,850.00,'2027-06-15',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(16,'Diclofenac Gel','Topical NSAID','Novartis',500,50,65.00,'2028-01-20',0,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(17,'Salbutamol Inhaler','Bronchodilator','Cipla',150,50,120.00,'2027-09-10',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(18,'Ranitidine 150mg','H2 Blocker','Glenmark',400,50,8.00,'2027-11-30',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(19,'Ciprofloxacin 500mg','Antibiotic','Ranbaxy',300,50,20.00,'2027-08-25',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(20,'Prednisolone 5mg','Corticosteroid','Wyeth',200,50,6.00,'2028-03-15',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(21,'Morphine Sulphate 10mg','Opioid Analgesic','Neon Labs',50,50,45.00,'2027-04-20',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(22,'Heparin 5000IU','Anticoagulant','Biological E',79,50,180.00,'2027-07-10',1,'2026-10-13 19:51:14','2026-10-13 19:51:15');
/*!40000 ALTER TABLE `medicines` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `before_medicine_stock_update` BEFORE UPDATE ON `medicines` FOR EACH ROW BEGIN
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

--
-- Table structure for table `nurse_ward_assignments`
--

DROP TABLE IF EXISTS `nurse_ward_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nurse_ward_assignments` (
  `assignment_id` int NOT NULL AUTO_INCREMENT,
  `nurse_user_id` int NOT NULL,
  `ward_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `assigned_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  KEY `idx_nwa_nurse_dates` (`nurse_user_id`,`start_date`,`end_date`),
  KEY `idx_nwa_ward` (`ward_id`),
  KEY `fk_nwa_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_nwa_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_nwa_nurse` FOREIGN KEY (`nurse_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_nwa_ward` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`ward_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_nwa_dates` CHECK (((`end_date` is null) or (`end_date` >= `start_date`)))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nurse_ward_assignments`
--

LOCK TABLES `nurse_ward_assignments` WRITE;
/*!40000 ALTER TABLE `nurse_ward_assignments` DISABLE KEYS */;
INSERT INTO `nurse_ward_assignments` VALUES (1,15,2,'2026-10-13',NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15'),(2,15,5,'2026-10-13',NULL,NULL,'2026-10-13 19:51:15','2026-10-13 19:51:15');
/*!40000 ALTER TABLE `nurse_ward_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `patient_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `date_of_birth` date NOT NULL,
  `dob_estimated` tinyint(1) NOT NULL DEFAULT '0',
  `gender` enum('MALE','FEMALE','OTHER') NOT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text,
  `emergency_contact` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `allergies` text,
  `abha_number` char(14) DEFAULT NULL,
  PRIMARY KEY (`patient_id`),
  UNIQUE KEY `uq_patients_abha` (`abha_number`),
  KEY `idx_patients_name` (`name`),
  KEY `idx_patients_phone` (`phone`),
  CONSTRAINT `chk_patients_abha_format` CHECK (((`abha_number` is null) or regexp_like(`abha_number`,_utf8mb4'^[0-9]{14}$')))
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES (1,'Aarav Sharma','1985-03-15',0,'MALE','O+','9111000001','12 MG Road, Delhi','9111100001','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(2,'Diya Patel','1990-07-22',0,'FEMALE','A+','9111000002','45 Park Street, Mumbai','9111100002','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(3,'Vihaan Reddy','1978-11-30',0,'MALE','B+','9111000003','78 Anna Salai, Chennai','9111100003','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(4,'Ananya Gupta','1995-05-10',0,'FEMALE','AB+','9111000004','23 Brigade Road, Bangalore','9111100004','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(5,'Aditya Kumar','1960-01-20',0,'MALE','O-','9111000005','56 Lal Bagh, Lucknow','9111100005','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(6,'Isha Singh','2000-08-14',0,'FEMALE','A-','9111000006','89 Civil Lines, Jaipur','9111100006','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(7,'Arjun Nair','1972-04-05',0,'MALE','B-','9111000007','34 Marine Drive, Kochi','9111100007','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(8,'Kavya Joshi','1988-12-25',0,'FEMALE','O+','9111000008','67 Mall Road, Shimla','9111100008','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(9,'Rohan Mehta','1993-09-18',0,'MALE','A+','9111000009','90 FC Road, Pune','9111100009','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(10,'Priya Verma','1982-06-02',0,'FEMALE','B+','9111000010','12 Hazratganj, Lucknow','9111100010','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(11,'Karthik Iyer','1975-02-28',0,'MALE','AB-','9111000011','45 T Nagar, Chennai','9111100011','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(12,'Sneha Rao','1998-10-08',0,'FEMALE','O+','9111000012','78 Koramangala, Bangalore','9111100012','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(13,'Manish Tiwari','1965-07-14',0,'MALE','A+','9111000013','23 Chandni Chowk, Delhi','9111100013','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(14,'Neeta Deshmukh','1991-03-20',0,'FEMALE','B+','9111000014','56 Deccan Gymkhana, Pune','9111100014','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(15,'Suresh Pillai','1970-11-11',0,'MALE','O-','9111000015','89 MG Road, Trivandrum','9111100015','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(16,'Ritu Agarwal','1987-08-30',0,'FEMALE','AB+','9111000016','34 Sector 17, Chandigarh','9111100016','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(17,'Amit Saxena','1980-05-25',0,'MALE','A-','9111000017','67 Jubilee Hills, Hyderabad','9111100017','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(18,'Pooja Thakur','1996-01-15',0,'FEMALE','B-','9111000018','90 Connaught Place, Delhi','9111100018','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(19,'Deepak Choudhary','1973-09-05',0,'MALE','O+','9111000019','12 Ellis Bridge, Ahmedabad','9111100019','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(20,'Meera Krishnan','1989-04-18',0,'FEMALE','A+','9111000020','45 Boat Club Road, Pune','9111100020','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(21,'Rajendra Mishra','1955-12-01',0,'MALE','B+','9111000021','78 Paldi, Ahmedabad','9111100021','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(22,'Sanya Bhatia','2002-06-28',0,'FEMALE','AB+','9111000022','23 Rajouri Garden, Delhi','9111100022','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(23,'Vikrant Chauhan','1968-03-12',0,'MALE','O-','9111000023','56 Aundh, Pune','9111100023','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(24,'Nidhi Pandey','1994-10-22',0,'FEMALE','A+','9111000024','89 Vaishali Nagar, Jaipur','9111100024','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(25,'Harsh Vardhan','1983-07-07',0,'MALE','B-','9111000025','34 Gomti Nagar, Lucknow','9111100025','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(26,'Tanvi Kapoor','1999-02-14',0,'FEMALE','O+','9111000026','67 Banjara Hills, Hyderabad','9111100026','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(27,'Siddharth Malhotra','1977-08-19',0,'MALE','A-','9111000027','90 Salt Lake, Kolkata','9111100027','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(28,'Gauri Sengupta','1986-05-03',0,'FEMALE','AB-','9111000028','12 Park Circus, Kolkata','9111100028','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(29,'Nikhil Banerjee','1992-11-28',0,'MALE','B+','9111000029','45 Alipore, Kolkata','9111100029','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(30,'Shruti Menon','1997-09-16',0,'FEMALE','O+','9111000030','78 Indiranagar, Bangalore','9111100030','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(31,'Ravi Shankar','1963-04-01',0,'MALE','A+','9111000031','23 Mylapore, Chennai','9111100031','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL),(32,'Aditi Kulkarni','2001-01-10',0,'FEMALE','B+','9111000032','56 Shivajinagar, Pune','9111100032','2026-10-13 19:51:14','2026-10-13 19:51:14',NULL,NULL);
/*!40000 ALTER TABLE `patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `pending_bills_view`
--

DROP TABLE IF EXISTS `pending_bills_view`;
/*!50001 DROP VIEW IF EXISTS `pending_bills_view`*/;
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

--
-- Table structure for table `pharmacy_stock_movements`
--

DROP TABLE IF EXISTS `pharmacy_stock_movements`;
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
  `batch_id` int DEFAULT NULL,
  PRIMARY KEY (`movement_id`),
  KEY `performed_by` (`performed_by`),
  KEY `idx_stock_movement_medicine` (`medicine_id`),
  KEY `idx_stock_movement_batch` (`batch_id`),
  KEY `fk_ctx_stock_movements_batch` (`batch_id`,`medicine_id`),
  CONSTRAINT `fk_ctx_stock_movements_batch` FOREIGN KEY (`batch_id`, `medicine_id`) REFERENCES `medicine_batches` (`batch_id`, `medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_stock_movement_batch` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches` (`batch_id`) ON DELETE RESTRICT,
  CONSTRAINT `pharmacy_stock_movements_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `pharmacy_stock_movements_ibfk_2` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pharmacy_stock_movements`
--

LOCK TABLES `pharmacy_stock_movements` WRITE;
/*!40000 ALTER TABLE `pharmacy_stock_movements` DISABLE KEYS */;
INSERT INTO `pharmacy_stock_movements` VALUES (1,1,'DISPENSE',-9,'Dispense Prescription',NULL,17,'2026-10-13 19:51:15',3,1),(2,4,'DISPENSE',-5,'Dispense Prescription',NULL,17,'2026-10-13 19:51:15',3,4),(3,3,'DISPENSE',-6,'Dispense Prescription',NULL,17,'2026-10-13 19:51:15',3,3),(4,22,'DISPENSE',-1,'Dispense Prescription',NULL,17,'2026-10-13 19:51:15',3,22);
/*!40000 ALTER TABLE `pharmacy_stock_movements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescription_item_batches`
--

DROP TABLE IF EXISTS `prescription_item_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prescription_item_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prescription_item_batches` (`item_id`,`batch_id`),
  KEY `idx_prescription_item_batches_batch` (`batch_id`),
  CONSTRAINT `fk_pib_batch` FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches` (`batch_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pib_item` FOREIGN KEY (`item_id`) REFERENCES `prescription_items` (`item_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_pib_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescription_item_batches`
--

LOCK TABLES `prescription_item_batches` WRITE;
/*!40000 ALTER TABLE `prescription_item_batches` DISABLE KEYS */;
INSERT INTO `prescription_item_batches` VALUES (1,7,1,9,'2026-10-13 19:51:15'),(2,8,4,5,'2026-10-13 19:51:15'),(3,9,3,6,'2026-10-13 19:51:15'),(4,10,22,1,'2026-10-13 19:51:15');
/*!40000 ALTER TABLE `prescription_item_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescription_items`
--

DROP TABLE IF EXISTS `prescription_items`;
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
  `frequency_code` enum('OD','BD','TDS','QID','Q6H','Q8H','STAT','PRN') DEFAULT NULL,
  `duration_days` smallint DEFAULT NULL,
  `route` enum('ORAL','IV','IM','SC','SUBLINGUAL','INHALED','TOPICAL','RECTAL','OTHER') DEFAULT NULL,
  `units_per_dose` smallint DEFAULT NULL,
  PRIMARY KEY (`item_id`),
  KEY `prescription_id` (`prescription_id`),
  KEY `medicine_id` (`medicine_id`),
  CONSTRAINT `prescription_items_ibfk_1` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`prescription_id`) ON DELETE CASCADE,
  CONSTRAINT `prescription_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_prescription_items_dispensed` CHECK (((`dispensed_at` is null) or (`dispensed` = 1))),
  CONSTRAINT `chk_prescription_items_structured` CHECK ((((`duration_days` is null) or (`duration_days` > 0)) and ((`units_per_dose` is null) or (`units_per_dose` > 0)))),
  CONSTRAINT `prescription_items_chk_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescription_items`
--

LOCK TABLES `prescription_items` WRITE;
/*!40000 ALTER TABLE `prescription_items` DISABLE KEYS */;
INSERT INTO `prescription_items` VALUES (1,1,3,'400mg','Twice daily','7 days',14,0,NULL,NULL,NULL,NULL,NULL),(2,1,16,'Apply','Three times daily','14 days',1,0,NULL,NULL,NULL,NULL,NULL),(3,2,5,'75mg','Once daily','30 days',30,0,NULL,NULL,NULL,NULL,NULL),(4,2,12,'75mg','Once daily','30 days',30,0,NULL,NULL,NULL,NULL,NULL),(5,2,13,'50mg','Twice daily','30 days',60,0,NULL,NULL,NULL,NULL,NULL),(6,2,11,'10mg','Once at night','30 days',30,0,NULL,NULL,NULL,NULL,NULL),(7,3,1,'500mg','Three times daily','3 days',9,1,'2026-10-13 19:51:15','TDS',3,'ORAL',NULL),(8,3,4,'20mg','Once daily before breakfast','5 days',5,1,'2026-10-13 19:51:15','OD',5,'ORAL',NULL),(9,3,3,'400mg','As needed for pain, max three a day','5 days',6,1,'2026-10-13 19:51:15','PRN',NULL,'ORAL',NULL),(10,3,22,'5000IU','Once, now','1 day',1,1,'2026-10-13 19:51:15','STAT',NULL,'SC',NULL);
/*!40000 ALTER TABLE `prescription_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_prescription_dispense` AFTER UPDATE ON `prescription_items` FOR EACH ROW BEGIN
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

--
-- Table structure for table `prescriptions`
--

DROP TABLE IF EXISTS `prescriptions`;
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
  `encounter_id` int DEFAULT NULL,
  `admission_id` int DEFAULT NULL,
  PRIMARY KEY (`prescription_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `idx_prescriptions_patient_status` (`patient_id`,`status`),
  KEY `idx_prescriptions_encounter` (`encounter_id`),
  KEY `idx_prescriptions_admission` (`admission_id`),
  KEY `fk_ctx_prescriptions_encounter` (`encounter_id`,`patient_id`,`doctor_id`),
  KEY `fk_ctx_prescriptions_admission` (`admission_id`,`patient_id`),
  KEY `fk_ctx_prescriptions_consultation` (`consultation_id`,`patient_id`),
  CONSTRAINT `fk_ctx_prescriptions_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_prescriptions_consultation` FOREIGN KEY (`consultation_id`, `patient_id`) REFERENCES `consultations` (`consultation_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_prescriptions_encounter` FOREIGN KEY (`encounter_id`, `patient_id`, `doctor_id`) REFERENCES `encounters` (`encounter_id`, `patient_id`, `doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prescriptions_admission` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_prescriptions_encounter` FOREIGN KEY (`encounter_id`) REFERENCES `encounters` (`encounter_id`) ON DELETE RESTRICT,
  CONSTRAINT `prescriptions_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`consultation_id`) ON DELETE CASCADE,
  CONSTRAINT `prescriptions_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `prescriptions_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescriptions`
--

LOCK TABLES `prescriptions` WRITE;
/*!40000 ALTER TABLE `prescriptions` DISABLE KEYS */;
INSERT INTO `prescriptions` VALUES (1,1,9,6,'2026-10-13 19:51:14','CREATED','Take with food','2026-10-13 19:51:14',2,NULL),(2,2,3,1,'2026-10-11 19:51:14','DISPENSED','Post-PCI medications','2026-10-13 19:51:14',4,NULL),(3,NULL,6,8,'2026-10-13 19:51:15','DISPENSED','Demo MAR seed (migration 008)','2026-10-13 19:51:15',NULL,NULL);
/*!40000 ALTER TABLE `prescriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `version` varchar(255) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('000_baseline.sql','2026-10-13 19:51:14',NULL),('001_audit_logs.sql','2026-10-13 19:51:15',NULL),('002_encounters.sql','2026-10-13 19:51:15',NULL),('003_nurse_assignments.sql','2026-10-13 19:51:15',NULL),('004_fix_general_ward_a_beds.sql','2026-10-13 19:51:15',NULL),('005_fix_general_ward_b_beds.sql','2026-10-13 19:51:15',NULL),('006_medicine_batches.sql','2026-10-13 19:51:15',NULL),('007_medication_administration.sql','2026-10-13 19:51:15',NULL),('008_seed_mar_demo.js','2026-10-13 19:51:15',NULL),('009_lab_reference_ranges.sql','2026-10-13 19:51:15',NULL),('010_patient_abha.sql','2026-10-13 19:51:15',NULL),('011_vital_signs.sql','2026-10-13 19:51:15',NULL),('012_emergency_visits.sql','2026-10-13 19:51:15',NULL),('013_order_admission.sql','2026-10-13 19:51:15',NULL),('014_patient_dob_estimated.sql','2026-10-13 19:51:15',NULL),('015_beds_floor_from_wards.sql','2026-10-13 19:51:15',NULL),('016_appointment_department_from_doctor.sql','2026-10-13 19:51:15',NULL),('017_mar_patient_from_prescription.sql','2026-10-13 19:51:15',NULL),('018_context_composite_fks.sql','2026-10-13 19:51:15',NULL),('019_bill_item_total_from_quantity.sql','2026-10-13 19:51:15',NULL),('020_workload_counts_active_admissions.sql','2026-10-13 19:51:15',NULL),('021_doctors_one_profile_per_user.sql','2026-10-13 19:51:15',NULL),('022_drop_redundant_columns.sql','2026-10-13 19:51:15',NULL),('023_prescription_items_dispensed_check.sql','2026-10-13 19:51:15',NULL);
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `surgery_requests`
--

DROP TABLE IF EXISTS `surgery_requests`;
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
  `encounter_id` int DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `idx_surgery_requests_encounter` (`encounter_id`),
  KEY `fk_ctx_surgery_requests_encounter` (`encounter_id`,`patient_id`,`doctor_id`),
  CONSTRAINT `fk_ctx_surgery_requests_encounter` FOREIGN KEY (`encounter_id`, `patient_id`, `doctor_id`) REFERENCES `encounters` (`encounter_id`, `patient_id`, `doctor_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_surgery_requests_encounter` FOREIGN KEY (`encounter_id`) REFERENCES `encounters` (`encounter_id`) ON DELETE RESTRICT,
  CONSTRAINT `surgery_requests_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE CASCADE,
  CONSTRAINT `surgery_requests_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `surgery_requests`
--

LOCK TABLES `surgery_requests` WRITE;
/*!40000 ALTER TABLE `surgery_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `surgery_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
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
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','ADMIN','System Administrator','admin@hospital.com','9000000001',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(2,'dr.smith','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. John Smith','john.smith@hospital.com','9000000002',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(3,'dr.patel','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Priya Patel','priya.patel@hospital.com','9000000003',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(4,'dr.kumar','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Rajesh Kumar','rajesh.kumar@hospital.com','9000000004',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(5,'dr.gupta','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Anita Gupta','anita.gupta@hospital.com','9000000005',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(6,'dr.sharma','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Vikram Sharma','vikram.sharma@hospital.com','9000000006',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(7,'dr.reddy','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Lakshmi Reddy','lakshmi.reddy@hospital.com','9000000007',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(8,'dr.singh','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Arjun Singh','arjun.singh@hospital.com','9000000008',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(9,'dr.mehta','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Neha Mehta','neha.mehta@hospital.com','9000000009',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(10,'dr.joshi','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Sunil Joshi','sunil.joshi@hospital.com','9000000010',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(11,'dr.rao','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Kavitha Rao','kavitha.rao@hospital.com','9000000011',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(12,'dr.das','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Amit Das','amit.das@hospital.com','9000000012',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(13,'dr.agarwal','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','DOCTOR','Dr. Ritu Agarwal','ritu.agarwal@hospital.com','9000000013',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(14,'reception1','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','RECEPTIONIST','Meena Verma','reception@hospital.com','9000000014',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(15,'nurse1','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','NURSE','Sunita Devi','nurse@hospital.com','9000000015',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(16,'lab_staff','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','LABORATORY','Laboratory Technician','lab@hospital.com','9999999991',1,'2026-10-13 19:51:14','2026-10-13 19:51:14'),(17,'pharmacy_staff','$2a$10$ApTRfQw9H66DJo2pemeuseLzqWMfrC2uFu4Io0c1gcyr6o/.Es0rC','PHARMACY','Pharmacist','pharmacy@hospital.com','9999999992',1,'2026-10-13 19:51:14','2026-10-13 19:51:14');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_appointments`
--

DROP TABLE IF EXISTS `v_appointments`;
/*!50001 DROP VIEW IF EXISTS `v_appointments`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_appointments` AS SELECT 
 1 AS `appointment_id`,
 1 AS `patient_id`,
 1 AS `doctor_id`,
 1 AS `department_id`,
 1 AS `appointment_date`,
 1 AS `appointment_time`,
 1 AS `status`,
 1 AS `reason`,
 1 AS `notes`,
 1 AS `created_at`,
 1 AS `updated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_current_stock`
--

DROP TABLE IF EXISTS `v_current_stock`;
/*!50001 DROP VIEW IF EXISTS `v_current_stock`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_current_stock` AS SELECT 
 1 AS `medicine_id`,
 1 AS `name`,
 1 AS `stock_quantity`,
 1 AS `batch_total`,
 1 AS `usable_quantity`,
 1 AS `expired_quantity`,
 1 AS `next_expiry`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `vital_signs`
--

DROP TABLE IF EXISTS `vital_signs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vital_signs` (
  `vital_id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `encounter_id` int DEFAULT NULL,
  `admission_id` int DEFAULT NULL,
  `recorded_at_utc` datetime NOT NULL,
  `recorded_by` int NOT NULL,
  `temperature_c` decimal(4,1) DEFAULT NULL,
  `pulse_bpm` smallint DEFAULT NULL,
  `resp_rate` smallint DEFAULT NULL,
  `bp_systolic` smallint DEFAULT NULL,
  `bp_diastolic` smallint DEFAULT NULL,
  `spo2_pct` smallint DEFAULT NULL,
  `pain_score` tinyint DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vital_id`),
  KEY `idx_vitals_patient_time` (`patient_id`,`recorded_at_utc`),
  KEY `idx_vitals_encounter` (`encounter_id`),
  KEY `idx_vitals_admission` (`admission_id`),
  KEY `fk_vitals_recorded_by` (`recorded_by`),
  KEY `fk_ctx_vital_signs_encounter` (`encounter_id`,`patient_id`),
  KEY `fk_ctx_vital_signs_admission` (`admission_id`,`patient_id`),
  CONSTRAINT `fk_ctx_vital_signs_admission` FOREIGN KEY (`admission_id`, `patient_id`) REFERENCES `admissions` (`admission_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ctx_vital_signs_encounter` FOREIGN KEY (`encounter_id`, `patient_id`) REFERENCES `encounters` (`encounter_id`, `patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vitals_admission` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`admission_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vitals_encounter` FOREIGN KEY (`encounter_id`) REFERENCES `encounters` (`encounter_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vitals_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_vitals_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_vitals_any` CHECK (((`temperature_c` is not null) or (`pulse_bpm` is not null) or (`resp_rate` is not null) or (`bp_systolic` is not null) or (`spo2_pct` is not null) or (`pain_score` is not null))),
  CONSTRAINT `chk_vitals_bp_order` CHECK (((`bp_systolic` is null) or (`bp_systolic` > `bp_diastolic`))),
  CONSTRAINT `chk_vitals_bp_pair` CHECK (((`bp_systolic` is null) = (`bp_diastolic` is null))),
  CONSTRAINT `chk_vitals_context` CHECK (((`encounter_id` is not null) or (`admission_id` is not null))),
  CONSTRAINT `chk_vitals_diastolic` CHECK (((`bp_diastolic` is null) or (`bp_diastolic` between 20 and 200))),
  CONSTRAINT `chk_vitals_pain` CHECK (((`pain_score` is null) or (`pain_score` between 0 and 10))),
  CONSTRAINT `chk_vitals_pulse` CHECK (((`pulse_bpm` is null) or (`pulse_bpm` between 20 and 250))),
  CONSTRAINT `chk_vitals_resp_rate` CHECK (((`resp_rate` is null) or (`resp_rate` between 4 and 80))),
  CONSTRAINT `chk_vitals_spo2` CHECK (((`spo2_pct` is null) or (`spo2_pct` between 50 and 100))),
  CONSTRAINT `chk_vitals_systolic` CHECK (((`bp_systolic` is null) or (`bp_systolic` between 40 and 300))),
  CONSTRAINT `chk_vitals_temperature` CHECK (((`temperature_c` is null) or (`temperature_c` between 25.0 and 45.0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vital_signs`
--

LOCK TABLES `vital_signs` WRITE;
/*!40000 ALTER TABLE `vital_signs` DISABLE KEYS */;
/*!40000 ALTER TABLE `vital_signs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wards`
--

DROP TABLE IF EXISTS `wards`;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wards`
--

LOCK TABLES `wards` WRITE;
/*!40000 ALTER TABLE `wards` DISABLE KEYS */;
INSERT INTO `wards` VALUES (1,'General Ward A',5,1,10,'GENERAL'),(2,'General Ward B',5,1,10,'GENERAL'),(3,'Cardiac Ward',2,2,6,'SPECIALTY'),(4,'Pediatric Ward',6,1,5,'PEDIATRIC'),(5,'ICU Ward',7,3,6,'ICU'),(6,'Emergency Observation',1,1,8,'EMERGENCY');
/*!40000 ALTER TABLE `wards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'hospital_db'
--

--
-- Dumping routines for database 'hospital_db'
--
/*!50003 DROP PROCEDURE IF EXISTS `sp_admit_patient` */;
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
/*!50003 DROP PROCEDURE IF EXISTS `sp_allocate_emergency` */;
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
/*!50003 DROP PROCEDURE IF EXISTS `sp_discharge_patient` */;
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
/*!50003 DROP PROCEDURE IF EXISTS `sp_generate_bill` */;
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

    -- Generic consultation fee; total_price is quantity * unit_price.
    INSERT INTO bill_items (bill_id, description, category, quantity, unit_price)
    VALUES (v_bill_id, 'Base Consultation Fee', 'CONSULTATION', 1, 500.00);

    SELECT SUM(total_price) INTO v_total FROM bill_items WHERE bill_id = v_bill_id;

    UPDATE bills SET total_amount = v_total WHERE bill_id = v_bill_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_get_emergency_queue` */;
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

--
-- Final view structure for view `available_beds_view`
--

/*!50001 DROP VIEW IF EXISTS `available_beds_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `available_beds_view` AS select `b`.`bed_id` AS `bed_id`,`b`.`bed_number` AS `bed_number`,`w`.`floor` AS `floor`,`b`.`bed_type` AS `bed_type`,`b`.`has_ventilator` AS `has_ventilator`,`w`.`name` AS `ward_name`,`d`.`name` AS `department_name` from ((`beds` `b` join `wards` `w` on((`b`.`ward_id` = `w`.`ward_id`))) join `departments` `d` on((`w`.`department_id` = `d`.`department_id`))) where (`b`.`status` = 'AVAILABLE') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `available_doctors_view`
--

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

--
-- Final view structure for view `bed_status_summary_view`
--

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

--
-- Final view structure for view `current_admissions_view`
--

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

--
-- Final view structure for view `doctor_workload_view`
--

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

--
-- Final view structure for view `emergency_queue_view`
--

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

--
-- Final view structure for view `hospital_occupancy_view`
--

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

--
-- Final view structure for view `pending_bills_view`
--

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

--
-- Final view structure for view `v_appointments`
--

/*!50001 DROP VIEW IF EXISTS `v_appointments`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=MERGE */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `v_appointments` AS select `a`.`appointment_id` AS `appointment_id`,`a`.`patient_id` AS `patient_id`,`a`.`doctor_id` AS `doctor_id`,`d`.`department_id` AS `department_id`,`a`.`appointment_date` AS `appointment_date`,`a`.`appointment_time` AS `appointment_time`,`a`.`status` AS `status`,`a`.`reason` AS `reason`,`a`.`notes` AS `notes`,`a`.`created_at` AS `created_at`,`a`.`updated_at` AS `updated_at` from (`appointments` `a` join `doctors` `d` on((`d`.`doctor_id` = `a`.`doctor_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_current_stock`
--

/*!50001 DROP VIEW IF EXISTS `v_current_stock`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 SQL SECURITY DEFINER */
/*!50001 VIEW `v_current_stock` AS select `m`.`medicine_id` AS `medicine_id`,`m`.`name` AS `name`,`m`.`stock_quantity` AS `stock_quantity`,coalesce(sum(`b`.`quantity`),0) AS `batch_total`,coalesce(sum((case when (`b`.`expiry_date` >= curdate()) then `b`.`quantity` end)),0) AS `usable_quantity`,coalesce(sum((case when (`b`.`expiry_date` < curdate()) then `b`.`quantity` end)),0) AS `expired_quantity`,min((case when ((`b`.`quantity` > 0) and (`b`.`expiry_date` >= curdate())) then `b`.`expiry_date` end)) AS `next_expiry` from (`medicines` `m` left join `medicine_batches` `b` on((`b`.`medicine_id` = `m`.`medicine_id`))) group by `m`.`medicine_id`,`m`.`name`,`m`.`stock_quantity` */;
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

-- Dump completed
