from sqlalchemy import Column, Integer, String, Boolean
from backend.database import Base

class ConnectionProfile(Base):
    __tablename__ = "connection_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=5432, nullable=False)
    db_name = Column(String, nullable=False)
    user = Column(String, nullable=False)
    password = Column(String, nullable=False)
    is_active = Column(Boolean, default=False)
