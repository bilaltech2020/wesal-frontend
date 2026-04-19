"""
Database models — Competitor Monitoring
جدولين فقط: competitors + competitor_prices
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, JSON, ForeignKey, Text, func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Competitor(Base):
    """
    إعدادات كل منافس — يُضاف من لوحة التحكم بدون كود.
    """
    __tablename__ = "competitors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)           # "Homecenter"
    base_url = Column(String(255), nullable=False)        # "https://www.homecenter.com.sa"
    search_url_template = Column(String(255), nullable=False)  # "/search?q={query}"
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # Selectors — JSON يحتوي على CSS selectors للموقع
    # {
    #   "product_card": ".product-item",
    #   "title": ".product-name",
    #   "price": ".price-box .price",
    #   "link": "a.product-link",
    #   "image": "img.product-image",
    #   "out_of_stock": ".out-of-stock"   ← اختياري
    # }
    selectors = Column(JSON, nullable=False)

    notes = Column(Text, nullable=True)   # ملاحظات للتيم

    prices = relationship("CompetitorPrice", back_populates="competitor")

    def to_config(self):
        from generic_scraper import CompetitorConfig
        return CompetitorConfig(
            id=self.id,
            name=self.name,
            base_url=self.base_url,
            search_url_template=self.search_url_template,
            selectors=self.selectors or {},
        )


class CompetitorPrice(Base):
    """
    نتائج المسح — سعر منتج عند منافس في وقت معين.
    """
    __tablename__ = "competitor_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(100), nullable=False, index=True)
    product_title = Column(String(255), nullable=True)
    competitor_id = Column(Integer, ForeignKey("competitors.id"), nullable=False)

    # البيانات المجموعة
    found = Column(Boolean, default=False)
    competitor_title = Column(String(255), nullable=True)   # اسم المنتج عندهم
    price = Column(Float, nullable=True)
    currency = Column(String(10), default="SAR")
    link = Column(Text, nullable=True)
    image = Column(Text, nullable=True)
    in_stock = Column(Boolean, default=False)
    raw_price = Column(String(50), nullable=True)           # السعر كما ظهر

    error = Column(String(255), nullable=True)
    scraped_at = Column(DateTime, server_default=func.now())

    competitor = relationship("Competitor", back_populates="prices")
