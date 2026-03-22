"""
VexlyPOS — Email Invoice Module
Sends professional HTML invoices via Resend API
"""
import os
import resend
from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter()
db = None

def set_db(database):
    global db
    db = database

# Configure Resend
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = "facturas@vexlyapp.com"


def build_invoice_html(bill: dict, config: dict) -> str:
    """Build professional HTML invoice email"""
    biz_name = config.get("restaurant_name", "VexlyPOS")
    biz_rnc = config.get("rnc", "")
    biz_phone = config.get("phone", "")
    biz_addr = config.get("address", "")
    
    # Items rows
    items_html = ""
    for item in bill.get("items", []):
        if item.get("status") == "cancelled":
            continue
        qty = item.get("quantity", 1)
        name = item.get("product_name", "")
        price = item.get("unit_price", 0)
        total = price * qty
        mods = ", ".join(m.get("name", "") if isinstance(m, dict) else str(m) for m in item.get("modifiers", []))
        mod_html = f'<br><span style="color:#888;font-size:12px;">  {mods}</span>' if mods else ""
        items_html += f'''
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">{qty}x {name}{mod_html}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">RD$ {total:,.2f}</td>
        </tr>'''
    
    # Tax breakdown
    tax_html = ""
    for tax in bill.get("tax_breakdown", []):
        tax_html += f'''
        <tr>
            <td style="padding:4px 12px;color:#666;">{tax.get("description","")} {tax.get("rate","")}%</td>
            <td style="padding:4px 12px;text-align:right;color:#666;">RD$ {tax.get("amount",0):,.2f}</td>
        </tr>'''
    if not tax_html:
        if bill.get("itbis", 0) > 0:
            tax_html += f'''
            <tr>
                <td style="padding:4px 12px;color:#666;">ITBIS 18%</td>
                <td style="padding:4px 12px;text-align:right;color:#666;">RD$ {bill.get("itbis",0):,.2f}</td>
            </tr>'''
        if bill.get("propina_legal", 0) > 0:
            tax_html += f'''
            <tr>
                <td style="padding:4px 12px;color:#666;">Propina Legal 10%</td>
                <td style="padding:4px 12px;text-align:right;color:#666;">RD$ {bill.get("propina_legal",0):,.2f}</td>
            </tr>'''
    
    # Discount
    discount_html = ""
    discount = bill.get("discount_applied")
    if discount and isinstance(discount, dict) and discount.get("amount", 0) > 0:
        discount_html = f'''
        <tr>
            <td style="padding:4px 12px;color:#e53e3e;">Descuento ({discount.get("name","")})</td>
            <td style="padding:4px 12px;text-align:right;color:#e53e3e;">-RD$ {discount["amount"]:,.2f}</td>
        </tr>'''
    
    # NCF info
    ncf_html = ""
    ncf = bill.get("ncf", "")
    if isinstance(ncf, dict) and ncf.get("full_ncf"):
        ncf_html = f'''
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin:16px 0;">
            <p style="margin:0;font-size:12px;color:#666;">Comprobante Fiscal (NCF)</p>
            <p style="margin:4px 0 0;font-weight:bold;font-size:16px;">{ncf.get("full_ncf","")}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#888;">Válido hasta: {ncf.get("expiry_date","")}</p>
        </div>'''
    elif isinstance(ncf, str) and ncf:
        ncf_html = f'''
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin:16px 0;">
            <p style="margin:0;font-size:12px;color:#666;">Comprobante Fiscal (NCF)</p>
            <p style="margin:4px 0 0;font-weight:bold;font-size:16px;">{ncf}</p>
        </div>'''
    
    # Customer info
    customer_html = ""
    if bill.get("razon_social"):
        customer_html += f'<p style="margin:2px 0;font-size:13px;">Cliente: <strong>{bill["razon_social"]}</strong></p>'
    if bill.get("fiscal_id"):
        customer_html += f'<p style="margin:2px 0;font-size:13px;">RNC/Cédula: {bill["fiscal_id"]}</p>'
    
    # Payment info
    payment_name = bill.get("payment_method_name", "Efectivo")
    
    # Format date
    paid_at = bill.get("paid_at", "")
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(paid_at.replace("Z", ""))
        date_str = dt.strftime("%d/%m/%Y %I:%M %p")
    except:
        date_str = paid_at[:16] if paid_at else ""
    
    html = f'''
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
            
            <!-- Header -->
            <div style="background:#1a1a2e;border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:2px;">{biz_name}</h1>
                {'<p style="color:#ccc;margin:8px 0 0;font-size:13px;">RNC: ' + biz_rnc + '</p>' if biz_rnc else ''}
                {'<p style="color:#999;margin:4px 0 0;font-size:12px;">' + biz_addr + '</p>' if biz_addr else ''}
                {'<p style="color:#999;margin:4px 0 0;font-size:12px;">Tel: ' + biz_phone + '</p>' if biz_phone else ''}
            </div>
            
            <!-- Invoice Badge -->
            <div style="background:#fff;padding:20px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <span style="background:#10b981;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold;">FACTURA</span>
                    </div>
                    <div style="text-align:right;">
                        <p style="margin:0;font-size:20px;font-weight:bold;">T-{bill.get("transaction_number","")}</p>
                        <p style="margin:2px 0 0;font-size:12px;color:#888;">{date_str}</p>
                    </div>
                </div>
                {ncf_html}
                {customer_html}
                <div style="margin-top:8px;font-size:13px;color:#666;">
                    <span>Mesa: {bill.get("table_number","")}</span>
                    <span style="margin-left:16px;">Mesero: {bill.get("waiter_name","")}</span>
                    <span style="margin-left:16px;">Cajero: {bill.get("cashier_name", bill.get("paid_by_name",""))}</span>
                </div>
            </div>
            
            <!-- Items -->
            <div style="background:#fff;padding:0 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid #e5e7eb;">
                            <th style="padding:12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;">Descripción</th>
                            <th style="padding:12px;text-align:right;font-size:12px;color:#888;text-transform:uppercase;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items_html}
                    </tbody>
                </table>
            </div>
            
            <!-- Totals -->
            <div style="background:#fff;padding:16px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <td style="padding:4px 12px;color:#666;">Subtotal</td>
                        <td style="padding:4px 12px;text-align:right;">RD$ {bill.get("subtotal",0):,.2f}</td>
                    </tr>
                    {tax_html}
                    {discount_html}
                </table>
                <div style="margin-top:12px;padding:16px 12px;background:#1a1a2e;border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:#fff;font-size:16px;font-weight:bold;">TOTAL</span>
                    <span style="color:#fff;font-size:24px;font-weight:bold;">RD$ {bill.get("total",0):,.2f}</span>
                </div>
            </div>
            
            <!-- Payment -->
            <div style="background:#fff;padding:16px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                <p style="margin:0;font-size:13px;color:#666;">
                    Forma de pago: <strong>{payment_name}</strong>
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background:#f8f9fa;border-radius:0 0 16px 16px;padding:24px;text-align:center;border:1px solid #e5e7eb;border-top:0;">
                <p style="margin:0;font-size:14px;font-weight:bold;color:#333;">Gracias por su visita!</p>
                <p style="margin:8px 0 0;font-size:11px;color:#999;">Este documento fue generado electrónicamente por {biz_name}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#999;">Conserve este comprobante para fines fiscales (DGII)</p>
            </div>
            
        </div>
    </body>
    </html>'''
    
    return html


@router.post("/send-invoice/{bill_id}")
async def send_invoice_email(bill_id: str):
    """Send invoice by email to the customer"""
    if not resend.api_key:
        raise HTTPException(status_code=500, detail="API de email no configurada")
    
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    customer_email = bill.get("customer_email", "")
    if not customer_email:
        raise HTTPException(status_code=400, detail="El cliente no tiene email registrado")
    
    # Get system config for business name
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    
    # Build HTML
    html = build_invoice_html(bill, config)
    
    biz_name = config.get("restaurant_name", "VexlyPOS")
    trans_num = bill.get("transaction_number", "")
    
    try:
        params = {
            "from": f"{biz_name} <{SENDER_EMAIL}>",
            "to": [customer_email],
            "subject": f"Factura T-{trans_num} — {biz_name}",
            "html": html,
        }
        email_response = resend.Emails.send(params)
        
        # Mark bill as email sent
        await db.bills.update_one({"id": bill_id}, {"$set": {"email_sent": True, "email_sent_to": customer_email}})
        
        return {"ok": True, "message": f"Factura enviada a {customer_email}", "email_id": email_response.get("id", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {str(e)}")


@router.post("/send-invoice/{bill_id}/preview")
async def preview_invoice_email(bill_id: str):
    """Preview the invoice email HTML without sending"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    html = build_invoice_html(bill, config)
    
    return {"html": html, "customer_email": bill.get("customer_email", "")}
