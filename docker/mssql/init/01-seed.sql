/*
  Idempotent seed for local MCP development.
  Creates AppDB (+ optional ReportingDB) with related tables so agents can
  exercise list/describe/read/search/FK/relationship/CRUD tools.
*/
SET NOCOUNT ON;
GO

IF DB_ID(N'AppDB') IS NULL
BEGIN
  CREATE DATABASE AppDB;
END
GO

IF DB_ID(N'ReportingDB') IS NULL
BEGIN
  CREATE DATABASE ReportingDB;
END
GO

USE AppDB;
GO

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customers (
    Id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(200) NULL,
    City NVARCHAR(100) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Customers_Status DEFAULT (N'active'),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT (SYSUTCDATETIME())
  );
END
GO

IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Products (
    Id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    Sku NVARCHAR(40) NOT NULL UNIQUE,
    Name NVARCHAR(120) NOT NULL,
    Category NVARCHAR(60) NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT (1)
  );
END
GO

IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Orders (
    Id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    CustomerId INT NOT NULL,
    OrderDate DATE NOT NULL CONSTRAINT DF_Orders_OrderDate DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT (N'pending'),
    Total DECIMAL(12, 2) NOT NULL CONSTRAINT DF_Orders_Total DEFAULT (0),
    CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId) REFERENCES dbo.Customers (Id)
  );
END
GO

IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OrderItems (
    Id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    OrderId INT NOT NULL,
    ProductId INT NOT NULL,
    Quantity INT NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (OrderId) REFERENCES dbo.Orders (Id),
    CONSTRAINT FK_OrderItems_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products (Id),
    CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity > 0)
  );
END
GO

IF OBJECT_ID(N'dbo.v_CustomerOrderSummary', N'V') IS NULL
BEGIN
  EXEC (N'
    CREATE VIEW dbo.v_CustomerOrderSummary AS
    SELECT
      c.Id AS CustomerId,
      c.Name AS CustomerName,
      c.City,
      COUNT(o.Id) AS OrderCount,
      ISNULL(SUM(o.Total), 0) AS LifetimeTotal
    FROM dbo.Customers c
    LEFT JOIN dbo.Orders o ON o.CustomerId = c.Id
    GROUP BY c.Id, c.Name, c.City;
  ');
END
GO

IF OBJECT_ID(N'dbo.usp_GetCustomerOrders', N'P') IS NULL
BEGIN
  EXEC (N'
    CREATE PROCEDURE dbo.usp_GetCustomerOrders
      @CustomerId INT
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT o.Id, o.OrderDate, o.Status, o.Total
      FROM dbo.Orders o
      WHERE o.CustomerId = @CustomerId
      ORDER BY o.OrderDate DESC, o.Id DESC;
    END
  ');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Customers)
BEGIN
  INSERT INTO dbo.Customers (Name, Email, City, Status)
  VALUES
    (N'Ada Lovelace', N'ada@example.com', N'New York', N'active'),
    (N'Alan Turing', N'alan@example.com', N'London', N'active'),
    (N'Grace Hopper', N'grace@example.com', N'New York', N'active'),
    (N'Katherine Johnson', N'katherine@example.com', N'Hampton', N'inactive');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Products)
BEGIN
  INSERT INTO dbo.Products (Sku, Name, Category, UnitPrice, IsActive)
  VALUES
    (N'SKU-BOOK-001', N'Analytical Engine Notes', N'Books', 29.99, 1),
    (N'SKU-HW-010', N'Mechanical Calculator', N'Hardware', 199.50, 1),
    (N'SKU-SW-100', N'Compiler Toolkit', N'Software', 79.00, 1),
    (N'SKU-ACC-005', N'Debug Cable', N'Accessories', 12.25, 0);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Orders)
BEGIN
  INSERT INTO dbo.Orders (CustomerId, OrderDate, Status, Total)
  VALUES
    (1, '2026-01-10', N'completed', 229.49),
    (1, '2026-02-02', N'pending', 79.00),
    (2, '2026-01-20', N'completed', 29.99),
    (3, '2026-03-01', N'shipped', 91.25);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.OrderItems)
BEGIN
  INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)
  VALUES
    (1, 1, 1, 29.99),
    (1, 2, 1, 199.50),
    (2, 3, 1, 79.00),
    (3, 1, 1, 29.99),
    (4, 3, 1, 79.00),
    (4, 4, 1, 12.25);
END
GO

USE ReportingDB;
GO

IF OBJECT_ID(N'dbo.DailySales', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DailySales (
    SaleDate DATE NOT NULL PRIMARY KEY,
    OrderCount INT NOT NULL,
    Revenue DECIMAL(12, 2) NOT NULL
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.DailySales)
BEGIN
  INSERT INTO dbo.DailySales (SaleDate, OrderCount, Revenue)
  VALUES
    ('2026-01-10', 1, 229.49),
    ('2026-01-20', 1, 29.99),
    ('2026-02-02', 1, 79.00),
    ('2026-03-01', 1, 91.25);
END
GO

PRINT N'Seed complete: AppDB (Customers/Products/Orders/OrderItems + view/proc) and ReportingDB (DailySales).';
GO
