"""Table name constants used by API routes.

This keeps route modules decoupled from the ETL pipeline implementation.
If you change table names in the ETL pipeline, update these constants too.
"""

SALES_TABLE = "sales"
SKUS_TABLE = "skus"
STOCK_TABLE = "stock"
PO_TABLE = "po"