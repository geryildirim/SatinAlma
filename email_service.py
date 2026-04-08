import os
import smtplib
from email.message import EmailMessage
from datetime import datetime
import database

def send_notification_email(subject: str, content: str):
    """
    Belirtilen konu ve içerik ile NOTIFY_EMAIL adresine e-posta gönderir.
    Eğer SMTP bilgileri ayarlanmamışsa, konsola sadece log basarak geçer.
    """
    # Veritabanından dinamik olarak ayarları çek (önbelleksiz)
    settings = database.get_settings()
    smtp_server = settings.get("smtp_server", "")
    smtp_port = settings.get("smtp_port", "587")
    smtp_user = settings.get("smtp_user", "")
    smtp_password = settings.get("smtp_password", "")
    notify_email = settings.get("notify_email", "admin@localhost")

    if not smtp_server or not smtp_user or not smtp_password:
        print(f"[Email Service MOCK] E-posta gönderimi simüle edildi.")
        print(f"Kimden: Sistem")
        print(f"Kime: {notify_email}")
        print(f"Konu: {subject}")
        print(f"İçerik:\n{content}")
        print("-" * 40)
        return False

    msg = EmailMessage()
    msg.set_content(content)
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = notify_email

    try:
        # TLS bağlantısı kullanarak e-postayı gönder
        port = int(smtp_port)
        server = smtplib.SMTP(smtp_server, port)
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        print(f"[Email Service] E-posta başarıyla gönderildi: {notify_email}")
        return True
    except Exception as e:
        print(f"[Email Service HATA] E-posta gönderilemedi: {e}")
        return False

def notify_new_request(request_no: str, description: str, amount: str, requester: str):
    """Yeni talep girildiğinde arayüzden çağrılacak yardımcı fonksiyon"""
    subject = f"Yeni Satın Alma Talebi: {request_no}"
    content = f"""
Merhaba,

Sisteme yeni bir satın alma talebi girilmiştir ve yöneticinin onayını beklemektedir.

Talep Detayları:
-------------------------------------
Talep No    : {request_no}
Talep Eden  : {requester}
Açıklama    : {description}
Belirtilen Tutar: {amount}
Tarih       : {datetime.now().strftime("%d.%m.%Y %H:%M")}

İyi çalışmalar,
CorpBuy Sistemi
"""
    send_notification_email(subject, content)

def notify_status_change(request_no: str, status: str, description: str):
    """Talebin durumu değiştiğinde (örneğin onaylandığında) çağrılacak yardımcı fonksiyon"""
    status_tr = status
    if status == 'approved':
        status_tr = 'Onaylandı (Satın Almada)'
    elif status == 'rejected':
        status_tr = 'Reddedildi'
    elif status == 'po':
        status_tr = 'Sipariş Geçildi'
    elif status == 'delivered':
        status_tr = 'Teslim Alındı'
    elif status == 'paid':
        status_tr = 'Ödendi'

    subject = f"Talep Durumu Güncellendi: {request_no} - {status_tr}"
    content = f"""
Merhaba,

{request_no} numaralı satın alma talebinin durumu güncellenmiştir.

Talep Detayları:
-------------------------------------
Talep No    : {request_no}
Açıklama    : {description}
Yeni Durum  : {status_tr}
Tarih       : {datetime.now().strftime("%d.%m.%Y %H:%M")}

Sisteme giriş yaparak detayları görüntüleyebilirsiniz.

İyi çalışmalar,
CorpBuy Sistemi
"""
    send_notification_email(subject, content)
