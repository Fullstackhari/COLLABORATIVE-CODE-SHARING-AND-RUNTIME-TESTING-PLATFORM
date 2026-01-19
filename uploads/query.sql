CREATE TABLE Customers (
    CustomerID INT PRIMARY KEY,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Email VARCHAR(100)
);

INSERT INTO Customers (CustomerID, FirstName, LastName, Email)
VALUES (1, 'John', 'Doe', 'john.doe@example.com'); 
INSERT INTO Customers (CustomerID, FirstName, LastName, Email)
VALUES (2, 'hari', 'ndra', 'harindra@example.com'); 

SELECT * FROM Customers;