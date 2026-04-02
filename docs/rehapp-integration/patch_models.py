# rehapp-backend/models.py — Kurum sınıfına eklenecek 2 alan
#
# Mevcut Kurum sınıfında reset_token_exp'in HEMEN ALTINA ekle:
#
#     reset_token     = Column(String, nullable=True)
#     reset_token_exp = Column(DateTime, nullable=True)
#     ↓ buraya:
#     bkds_email      = Column(String(200), nullable=True)
#     bkds_password   = Column(String(256), nullable=True)
#
# Sonra migration çalıştır:
#     alembic revision --autogenerate -m "add bkds credentials to kurum"
#     alembic upgrade head
#
# Alembic kullanmıyorsan direkt SQL:
#     ALTER TABLE kurumlar ADD COLUMN bkds_email VARCHAR(200);
#     ALTER TABLE kurumlar ADD COLUMN bkds_password VARCHAR(256);

# ── Tam güncellenmiş Kurum sınıfı (kopyala-yapıştır) ──────────────────────

class Kurum(Base):
    __tablename__ = "kurumlar"

    id              = Column(Integer, primary_key=True, index=True)
    ad              = Column(String(200), nullable=False)
    email           = Column(String(200), unique=True, nullable=False, index=True)
    hashed_password = Column(String(256), nullable=False)
    approved        = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    son_giris       = Column(DateTime(timezone=True), nullable=True)
    reset_token     = Column(String, nullable=True)
    reset_token_exp = Column(DateTime, nullable=True)

    # ── BKDS Takip SSO kimlik bilgileri ─────────────────────────────────────
    bkds_email    = Column(String(200), nullable=True)   # bkds-takip admin e-posta
    bkds_password = Column(String(256), nullable=True)   # bkds-takip admin şifresi (düz metin)
    # ────────────────────────────────────────────────────────────────────────

    students      = relationship("Student",    back_populates="kurum", cascade="all, delete-orphan")
    diagnoses     = relationship("Diagnosis",  back_populates="kurum", cascade="all, delete-orphan")
    modules       = relationship("Module",     back_populates="kurum", cascade="all, delete-orphan")
    saved_groups  = relationship("SavedGroup", back_populates="kurum", cascade="all, delete-orphan")
