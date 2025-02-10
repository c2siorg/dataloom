import pandas as pd
import numpy as np

def select(df, columns):
    """
    Selects specific columns from the DataFrame.

    Parameters:
        df (DataFrame): The pandas DataFrame.
        columns (list): A list of column names to select.

    Returns:
        DataFrame: A DataFrame containing only the specified columns.
    """
    return df[columns]

def get_numeric_cols(df):
    """
    Gets the names of numeric columns in the DataFrame.

    Parameters:
        df (DataFrame): The pandas DataFrame.

    Returns:
        list: A list of column names containing numeric data.
    """
    return df.select_dtypes(include=np.number).columns.tolist()

def get_min_max(df, col):
    """
    Gets the minimum and maximum values from a numeric column.

    Parameters:
        df (DataFrame): The pandas DataFrame.
        col (str): The name of the numeric column.

    Returns:
        tuple: A tuple containing the minimum and maximum values of the column.
    """
    return df[col].min(), df[col].max()

def filter_number(df, column, min=None, max=None):
    """
    Filters the DataFrame based on the values of a numeric column within a specified range.

    Parameters:
        df (DataFrame): The pandas DataFrame.
        column (str): The name of the numeric column to filter.
        min (float or int): The minimum value (inclusive). If None, no minimum limit is applied.
        max (float or int): The maximum value (inclusive). If None, no maximum limit is applied.

    Returns:
        DataFrame: A DataFrame containing only the rows that meet the specified conditions.
    """
    if (min is None) and (max is None):
        return df
    elif min is None:
        return df[df[column]<=max]
    elif max is None:
        return df[min<=df[column]]
    else:
        return df[df[column].map(lambda x: min<=x<=max)]
    
def dropna(df, columns=None):
    """
    Drops rows with missing values from the DataFrame.

    Parameters:
        df (DataFrame): The pandas DataFrame.
        columns (str or list, optional): Specifies columns to consider when dropping rows. If "all", drops rows where all columns have missing values. If None (default), drops rows if any column has a missing value.

    Returns:
        DataFrame: A DataFrame with rows containing missing values removed.
    """
    if columns=="all":
        return df.dropna()
    elif columns is not None:
        return df.dropna(subset=columns)

def group(df, by, funcs):
    """
    Groups the DataFrame by specified columns and applies aggregation functions.

    Parameters:
        df (DataFrame): The pandas DataFrame.
        by (str or list): Column(s) to group by.
        funcs (dict): Dictionary specifying column names and corresponding aggregation functions.

    Returns:
        DataFrame: A DataFrame with grouped data and aggregated values.
    """
    cols = df.columns[(df.dtypes!=object) | (df.columns.isin(by))]
    return df[cols].groupby(by=by).agg(funcs)

def info(df):
    """
    Provides information about the DataFrame, including non-null values and data types.

    Parameters:
        df (DataFrame): The pandas DataFrame.

    Returns:
        DataFrame: A DataFrame containing non-null values and data types for each column.
    """
    df1 = df.count()
    df2 = pd.Series(df.dtypes)
    
    df3 = pd.concat([df1, df2], axis=1)
    df3.columns = ["non-Null Values", "dtypes"]
    
    return df3.astype(str)

def describe(df):
    """
    Generates descriptive statistics for numeric columns in the DataFrame.

    Parameters:
        df (DataFrame): The pandas DataFrame.

    Returns:
        DataFrame: A DataFrame containing descriptive statistics (count, mean, std, min, 25%, 50%, 75%, max) for numeric columns.
    """
    if (len(df)*len(df.columns))>0:
        return df.describe()
    else:
        return df