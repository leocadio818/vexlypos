"""
VexlyPOS — Email Invoice Module
Sends professional HTML invoices via Resend API
"""
import os
import resend
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
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
    
    # NCF info — use e-NCF if available, otherwise local NCF
    ncf_html = ""
    ecf_encf = bill.get("ecf_encf", "")
    ecf_code = bill.get("ecf_security_code", "")
    if ecf_encf:
        ncf_html = f'''
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin:16px 0;">
            <p style="margin:0;font-size:12px;color:#666;">Comprobante Fiscal Electrónico (e-NCF)</p>
            <p style="margin:4px 0 0;font-weight:bold;font-size:16px;">{ecf_encf}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#888;">Código: {ecf_code}</p>
        </div>'''
    else:
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
    except Exception:
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
                <div style="margin-top:12px;padding:16px 12px;background:#1a1a2e;border-radius:12px;text-align:center;">
                    <span style="color:#999;font-size:14px;display:block;margin-bottom:4px;">TOTAL</span>
                    <span style="color:#fff;font-size:28px;font-weight:bold;">RD$ {bill.get("total",0):,.2f}</span>
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
                {'<div style="margin-bottom:16px;"><p style="margin:0 0 8px;font-size:12px;color:#666;font-weight:bold;">FACTURACIÓN ELECTRÓNICA</p><p style="margin:0 0 4px;font-size:13px;font-weight:bold;">' + (bill.get("ecf_encf") or "") + '</p><p style="margin:0 0 8px;font-size:11px;color:#888;">Código: ' + (bill.get("ecf_security_code") or "") + '</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + (bill.get("ecf_stamp_url") or "").replace("&", "%26") + '" width="150" height="150" style="margin:0 auto;" /><p style="margin:8px 0 0;font-size:10px;color:#aaa;">Escanea para verificar en la DGII</p></div>' if bill.get("ecf_stamp_url") else ''}
                <p style="margin:0;font-size:14px;font-weight:bold;color:#333;">Gracias por su visita!</p>
                <p style="margin:8px 0 0;font-size:11px;color:#999;">Este documento fue generado electrónicamente por {biz_name}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#999;">Conserve este comprobante para fines fiscales (DGII)</p>
            </div>
            
        </div>
    </body>
    </html>'''
    
    return html


@router.post("/send-invoice/{bill_id}")
async def send_invoice_email(bill_id: str, email_override: Optional[str] = Query(None)):
    """Send invoice by email to the customer"""
    if not resend.api_key:
        raise HTTPException(status_code=500, detail="API de email no configurada")
    
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    customer_email = email_override or bill.get("customer_email", "")
    if not customer_email:
        raise HTTPException(status_code=400, detail="El cliente no tiene email registrado")
    
    # Update bill with email if provided
    if email_override:
        await db.bills.update_one({"id": bill_id}, {"$set": {"customer_email": email_override}})
    
    # Get system config for business name
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    
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
        # Log email error to system_logs
        try:
            from routers.system_logs import log_email_error
            await log_email_error(
                technical_error=str(e),
                email=customer_email,
                error_type="email_invoice_failed"
            )
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error enviando email: {str(e)}")


@router.post("/send-invoice/{bill_id}/preview")
async def preview_invoice_email(bill_id: str):
    """Preview the invoice email HTML without sending"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    html = build_invoice_html(bill, config)
    
    return {"html": html, "customer_email": bill.get("customer_email", "")}


# ─── MARKETING EMAIL ───

def build_marketing_html(config: dict, subject: str, message: str, products: list = None) -> str:
    """Build professional HTML marketing email"""
    biz_name = config.get("restaurant_name", "VexlyPOS")
    logo_url = config.get("logo_url", "")
    phone = config.get("phone", "")
    address = config.get("address", "")
    
    # Products section
    products_html = ""
    if products and len(products) > 0:
        products_rows = ""
        for p in products:
            name = p.get("name", "")
            price = p.get("price", 0)
            if name:
                products_rows += f'''
                <tr>
                    <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:15px;color:#333;">{name}</td>
                    <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:15px;color:#FF6600;font-weight:bold;text-align:right;">RD$ {price:,.2f}</td>
                </tr>'''
        
        if products_rows:
            products_html = f'''
            <div style="margin:24px 0;">
                <h3 style="color:#FF6600;font-size:18px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #FF6600;">Productos Destacados</h3>
                <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    {products_rows}
                </table>
            </div>'''
    
    # Logo section
    logo_html = ""
    if logo_url:
        logo_html = f'<img src="{logo_url}" alt="{biz_name}" style="max-height:60px;max-width:200px;margin-bottom:8px;" />'
    
    # Message with line breaks
    message_formatted = message.replace('\n', '<br>')
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#FF6600 0%,#FF8533 100%);padding:30px 24px;text-align:center;">
            {logo_html}
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">{biz_name}</h1>
        </div>
        
        <!-- Subject as Title -->
        <div style="padding:24px 24px 0;">
            <h2 style="color:#333;font-size:22px;margin:0 0 16px;line-height:1.3;">{subject}</h2>
        </div>
        
        <!-- Main Message -->
        <div style="padding:0 24px 24px;">
            <p style="color:#555;font-size:15px;line-height:1.7;margin:0;">{message_formatted}</p>
        </div>
        
        {products_html}
        
        <!-- Footer -->
        <div style="background:#f9f9f9;padding:20px 24px;border-top:1px solid #eee;">
            <p style="color:#888;font-size:13px;margin:0 0 8px;text-align:center;">
                {f'<span style="margin-right:16px;">📍 {address}</span>' if address else ''}
                {f'<span>📞 {phone}</span>' if phone else ''}
            </p>
            <p style="color:#aaa;font-size:11px;margin:0;text-align:center;">
                Para cancelar suscripción responda a este email
            </p>
        </div>
        
    </div>
</body>
</html>'''
    
    return html


@router.post("/send-marketing")
async def send_marketing_email(input: dict):
    """Send marketing email to all customers with email addresses"""
    # Feature flag gate — must be enabled in system_config.feature_email_marketing
    from routers.features import require_feature
    await require_feature("email_marketing")

    if not resend.api_key:
        raise HTTPException(status_code=500, detail="API de email no configurada")
    
    subject = input.get("subject", "").strip()
    message = input.get("message", "").strip()
    products = input.get("products", [])
    
    if not subject:
        raise HTTPException(status_code=400, detail="El asunto es requerido")
    if not message:
        raise HTTPException(status_code=400, detail="El mensaje es requerido")
    
    # Get system config for branding
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    biz_name = config.get("restaurant_name", "VexlyPOS")
    
    # Build HTML template
    html = build_marketing_html(config, subject, message, products)
    
    # Get all customers with valid email
    customers = await db.customers.find(
        {"$and": [{"email": {"$ne": None}}, {"email": {"$ne": ""}}]},
        {"_id": 0, "email": 1, "name": 1}
    ).to_list(5000)
    
    # Filter out empty emails (double check)
    customers_with_email = [c for c in customers if c.get("email", "").strip()]
    
    if not customers_with_email:
        raise HTTPException(status_code=400, detail="No hay clientes con email registrado")
    
    # Send emails
    sent_count = 0
    failed_emails = []
    
    for customer in customers_with_email:
        try:
            params = {
                "from": f"{biz_name} <{SENDER_EMAIL}>",
                "to": [customer["email"]],
                "subject": subject,
                "html": html,
            }
            resend.Emails.send(params)
            sent_count += 1
        except Exception as e:
            failed_emails.append({"email": customer["email"], "error": str(e)})
            # Log each failed email to system_logs
            try:
                from routers.system_logs import log_email_error
                await log_email_error(
                    technical_error=str(e),
                    email=customer["email"],
                    error_type="email_send_failed"
                )
            except Exception:
                pass
    
    return {
        "ok": True,
        "sent_count": sent_count,
        "total_customers": len(customers_with_email),
        "failed_count": len(failed_emails),
        "failed_emails": failed_emails[:10] if failed_emails else []
    }


@router.post("/send-marketing/preview")
async def preview_marketing_email(input: dict):
    """Preview marketing email without sending"""
    subject = input.get("subject", "Asunto de ejemplo")
    message = input.get("message", "Este es un mensaje de ejemplo.")
    products = input.get("products", [])
    
    # Get system config for branding
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    
    # Build HTML template
    html = build_marketing_html(config, subject, message, products)
    
    # Count customers with email
    count = await db.customers.count_documents({"$and": [{"email": {"$ne": None}}, {"email": {"$ne": ""}}]})
    
    return {
        "html": html,
        "customer_count": count
    }

