import pandas as pd
import sys
import os

# Add parent directory to sys.path to import app modules
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.services.transformation_service import melt_dataframe, TransformationError

def test_melt():
    # Setup sample data
    df = pd.DataFrame({
        'ID': [1, 2],
        'Name': ['Alice', 'Bob'],
        'Math': [90, 80],
        'Science': [85, 88]
    })
    
    print("Original DataFrame:")
    print(df)
    print("\n" + "="*50 + "\n")

    # Case 1: Basic Melt
    print("Case 1: Basic Melt (id_vars=['ID', 'Name'])")
    params = {
        'id_vars': ['ID', 'Name'],
        'value_vars': ['Math', 'Science'],
        'var_name': 'Subject',
        'value_name': 'Score'
    }
    melted = melt_dataframe(df, params)
    print(melted)
    assert len(melted) == 4
    assert 'Subject' in melted.columns
    assert 'Score' in melted.columns
    print("SUCCESS")
    print("\n" + "="*50 + "\n")

    # Case 2: Melt without value_vars (should use all non-id cols)
    print("Case 2: Melt without value_vars")
    params = {
        'id_vars': ['ID', 'Name'],
        'var_name': 'Category',
        'value_name': 'Points'
    }
    melted = melt_dataframe(df, params)
    print(melted)
    assert len(melted) == 4
    print("SUCCESS")
    print("\n" + "="*50 + "\n")

    # Case 3: Validation - Overlap
    print("Case 3: Validation - Overlap (ID in both id_vars and value_vars)")
    params = {
        'id_vars': ['ID'],
        'value_vars': ['ID', 'Math']
    }
    try:
        melt_dataframe(df, params)
        print("FAILED: Should have raised TransformationError")
    except TransformationError as e:
        print(f"SUCCESS: Caught expected error: {e}")
    print("\n" + "="*50 + "\n")

    # Case 4: Validation - Missing Column
    print("Case 4: Validation - Missing Column")
    params = {
        'id_vars': ['MissingCol'],
        'value_vars': ['Math']
    }
    try:
        melt_dataframe(df, params)
        print("FAILED: Should have raised TransformationError")
    except TransformationError as e:
        print(f"SUCCESS: Caught expected error: {e}")
    print("\n" + "="*50 + "\n")

    # Case 5: Validation - Conflict with target name
    print("Case 5: Validation - Conflict with target name ('Math' already exists)")
    params = {
        'id_vars': ['ID'],
        'value_vars': ['Science'],
        'var_name': 'Math'
    }
    try:
        melt_dataframe(df, params)
        print("FAILED: Should have raised TransformationError")
    except TransformationError as e:
        print(f"SUCCESS: Caught expected error: {e}")
    print("\n" + "="*50 + "\n")

if __name__ == "__main__":
    try:
        test_melt()
    except Exception as e:
        print(f"Test failed with error: {e}")
        sys.exit(1)
