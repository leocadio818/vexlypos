"""
Pydantic models (schemas) for request/response validation.
"""
from typing import List, Optional
from pydantic import BaseModel


# ─── AUTH & USERS ───
class LoginInput(BaseModel):
    pin: str

class UserInput(BaseModel):
    name: str
    pin: str
    role: str = "waiter"


# ─── AREAS & TABLES ───
class AreaInput(BaseModel):
    name: str
    color: str = "#FF6600"

class TableInput(BaseModel):
    number: int
    area_id: str
    capacity: int = 4
    shape: str = "round"
    x: float = 50
    y: float = 50
    width: float = 80
    height: float = 80


# ─── CATEGORIES & PRODUCTS ───
class CategoryInput(BaseModel):
    name: str
    color: str = "#FF6600"
    icon: str = "utensils"

class ProductModifierAssignment(BaseModel):
    group_id: str
    min_selections: int = 0
    max_selections: int = 0
    allow_multiple: bool = False

class ProductInput(BaseModel):
    name: str
    printed_name: str = ""
    category_id: str
    report_category_id: str = ""
    price: float
    price_a: float = 0
    price_b: float = 0
    price_c: float = 0
    price_d: float = 0
    price_e: float = 0
    button_bg_color: str = ""
    button_text_color: str = ""
    modifier_group_ids: List[str] = []
    modifier_assignments: List[ProductModifierAssignment] = []
    track_inventory: bool = False


# ─── MODIFIERS ───
class ModifierOptionInput(BaseModel):
    name: str
    price: float = 0

class ModifierGroupInput(BaseModel):
    name: str
    required: bool = False
    max_selections: int = 0
    options: List[ModifierOptionInput] = []


# ─── ORDERS ───
class OrderItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float = 1
    unit_price: float
    modifiers: List[dict] = []
    notes: str = ""

class CreateOrderInput(BaseModel):
    table_id: str
    items: List[OrderItemInput] = []

class AddItemsInput(BaseModel):
    items: List[OrderItemInput]

class CancelItemInput(BaseModel):
    reason_id: str
    return_to_inventory: bool = False
    comments: str = ""
    authorized_by_id: Optional[str] = None
    authorized_by_name: Optional[str] = None
    
class BulkCancelInput(BaseModel):
    item_ids: List[str]
    reason_id: str
    return_to_inventory: bool = False
    comments: str = ""
    authorized_by_id: Optional[str] = None
    authorized_by_name: Optional[str] = None

class CancellationReasonInput(BaseModel):
    name: str
    return_to_inventory: bool = True
    requires_manager_auth: bool = False


# ─── BILLS & PAYMENTS ───
class CreateBillInput(BaseModel):
    order_id: str
    table_id: str
    label: str = ""
    item_ids: List[str] = []
    tip_percentage: float = 10
    payment_method: str = "cash"
    customer_id: str = ""

class PayBillInput(BaseModel):
    payment_method: str = "cash"
    payment_method_id: str = ""
    tip_percentage: float = 0
    additional_tip: float = 0
    customer_id: str = ""
    sale_type: str = "dine_in"


# ─── SHIFTS ───
class ShiftOpenInput(BaseModel):
    station: str = "Caja 1"
    opening_amount: float = 0

class ShiftCloseInput(BaseModel):
    closing_amount: float = 0
    cash_count: Optional[dict] = None


# ─── WAREHOUSES & SUPPLIERS ───
class WarehouseInput(BaseModel):
    name: str
    location: str = ""

class SupplierInput(BaseModel):
    name: str
    contact_name: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    rnc: str = ""
    category: str = "general"  # licores, tabaco, alimentos, general


# ─── INGREDIENTS ───
class IngredientInput(BaseModel):
    name: str
    unit: str = "unidad"
    category: str = "general"
    min_stock: float = 0
    avg_cost: float = 0
    is_subrecipe: bool = False
    recipe_id: str = ""
    purchase_unit: str = ""
    purchase_quantity: float = 1
    dispatch_quantity: float = 1
    conversion_factor: float = 1
    default_supplier_id: str = ""
    margin_threshold: float = 30.0

class UnitDefinitionInput(BaseModel):
    name: str
    abbreviation: str
    category: str = "custom"

class IngredientAuditInput(BaseModel):
    ingredient_id: str
    field_changed: str
    old_value: str
    new_value: str
    changed_by_id: str
    changed_by_name: str


# ─── RECIPES ───
class RecipeIngredientInput(BaseModel):
    ingredient_id: str
    ingredient_name: str = ""
    quantity: float
    unit: str = "unidad"
    waste_percentage: float = 0
    is_subrecipe: bool = False

class RecipeInput(BaseModel):
    product_id: str
    product_name: str
    ingredients: List[RecipeIngredientInput]
    yield_quantity: float = 1
    notes: str = ""
    is_subrecipe: bool = False
    produces_ingredient_id: str = ""


# ─── STOCK ───
class StockInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    current_stock: float
    min_stock: float = 0

class StockMovementInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    quantity: float
    movement_type: str
    reference_id: str = ""
    parent_product_id: str = ""
    parent_recipe_id: str = ""
    notes: str = ""

class StockDifferenceInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    quantity: float
    input_unit: str
    difference_type: str = "faltante"
    reason: str = ""
    observations: str = ""

class StockDeductInput(BaseModel):
    product_id: str
    warehouse_id: str
    quantity: float = 1
    order_id: str = ""

class StockTransferInput(BaseModel):
    ingredient_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: float
    notes: str = ""


# ─── PURCHASE ORDERS ───
class POItemInput(BaseModel):
    ingredient_id: str
    ingredient_name: str = ""
    quantity: float
    unit_price: float
    received_quantity: float = 0

class PurchaseOrderInput(BaseModel):
    supplier_id: str
    warehouse_id: str
    items: List[POItemInput]
    notes: str = ""
    expected_date: str = ""

class ReceivePOItemInput(BaseModel):
    ingredient_id: str
    received_quantity: float
    actual_unit_price: float = 0

class ReceivePOInput(BaseModel):
    warehouse_id: str
    items: List[ReceivePOItemInput]
    notes: str = ""


# ─── PURCHASING ASSISTANT ───
class GeneratePOFromSuggestionsInput(BaseModel):
    supplier_id: str
    warehouse_id: str
    ingredient_ids: List[str]
    notes: str = ""


# ─── PRODUCTION ───
class ProductionInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    quantity: float
    notes: str = ""


# ─── CUSTOMERS ───
class CustomerInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""


# ─── MISC ───
class InventoryAdjustInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    quantity: float
    reason: str = "Ajuste manual"

class EmailInput(BaseModel):
    to: str
    subject: str
    html: str
