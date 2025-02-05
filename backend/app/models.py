from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text, Enum, JSON, Boolean, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from enum import Enum as PyEnum
import datetime
from dotenv import load_dotenv
import os
Base = declarative_base()

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

class OperationType(PyEnum):
    CLEAN = 'clean'
    AGGREGATE = 'aggregate'
    FILTER = 'filter'
    MERGE = 'merge'
    PIVOT = 'pivot'

operation_enum = Enum(OperationType, name='operation_enum')


class Dataset(Base): 
    __tablename__ = "datasets"
    dataset_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    upload_date = Column(DateTime, default=datetime.datetime.now)
    last_modified = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)
    file_path = Column(String)

    logs = relationship("DatasetChangeLog", back_populates="dataset")
    checkpoints = relationship("Checkpoint", back_populates="dataset") 



class DatasetChangeLog(Base):
    __tablename__ = 'user_logs'
    change_log_id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey('datasets.dataset_id'), nullable=False)
    action_type = Column(String(50), nullable=False)
    action_details = Column(JSON, nullable=False)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)
    checkpoint_id = Column(Integer, nullable=True)
    applied = Column(Boolean, server_default="false", nullable=False)

    dataset = relationship("Dataset", back_populates="logs")


class Checkpoint(Base):
    __tablename__ = 'checkpoints'
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey('datasets.dataset_id'), nullable=False)
    message = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    dataset = relationship("Dataset", back_populates="checkpoints")

# Create engine and session
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
session = Session()
