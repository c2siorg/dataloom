import os

from sqlalchemy import create_engine, text


def reset_db():
    db_url = os.environ.get("DATABASE_URL", "postgresql://nodesagar@localhost:5432/dataloom")
    engine = create_engine(db_url)
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
        conn.commit()


if __name__ == "__main__":
    reset_db()
