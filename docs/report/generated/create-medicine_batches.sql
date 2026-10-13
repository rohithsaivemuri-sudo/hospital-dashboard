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
) ENGINE=InnoDB;
