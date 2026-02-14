"""
MongoDB database connection and client.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mesa_pos")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
