#!/bin/bash

# Hata oluşursa betiği durdur
set -e

echo "======================================================"
echo "🚀 CorpBuy Sunucusu 8001 Portunda Başlatılıyor..."
echo "======================================================"

# Sanal ortam (venv) kontrolü ve aktivasyonu
if [ -d "venv" ]; then
    echo "[1/4] Sanal ortam (venv) etkinleştiriliyor..."
    source venv/bin/activate
else
    echo "[!] Uyarı: 'venv' klasörü bulunamadı."
    echo "Bağımlılıkları kurduğunuzdan emin olun."
fi

# Gerekli bağımlılıkların kontrolü ve kurulumu (opsiyonel)
echo "[2/4] Bağımlılıkların yüklü olduğu kontrol ediliyor..."
pip install -r requirements.txt --quiet

echo "[3/4] Uvicorn sunucusu başlatılıyor..."
echo "Sunucu adresi: http://localhost:8001"
echo "Çıkış yapmak için CTRL+C tuşlarına basın."

# FastAPI uygulamasını Uvicorn ile başlatıyoruz
# --host 0.0.0.0 ile diğer bilgisayarların da erişmesine izin verilebilir, biz localhost (127.0.0.1) kullanacağız.
exec uvicorn main:app --port 8001 --reload
