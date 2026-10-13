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
) ENGINE=InnoDB;
