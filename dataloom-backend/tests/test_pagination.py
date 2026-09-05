import pandas as pd

from app.utils.pandas_helpers import paginate_dataframe


def test_paginate_dataframe_basic():
    df = pd.DataFrame({"a": range(105)})

    # Page 1, size 50
    sliced_df, pagination = paginate_dataframe(df, 1, 50)
    assert len(sliced_df) == 50
    assert pagination["page"] == 1
    assert pagination["page_size"] == 50
    assert pagination["total_rows"] == 105
    assert pagination["total_pages"] == 3

    # Page 3, size 50 (last page, partial)
    sliced_df, pagination = paginate_dataframe(df, 3, 50)
    assert len(sliced_df) == 5
    assert pagination["page"] == 3

    # Out of range page clamps to last page
    sliced_df, pagination = paginate_dataframe(df, 10, 50)
    assert len(sliced_df) == 5
    assert pagination["page"] == 3


def test_paginate_dataframe_page_below_minimum_clamps_to_first_page():
    df = pd.DataFrame({"a": range(105)})

    # page=0 must not produce a negative start index (which would slice from
    # the end of the frame); it clamps up to the first page.
    sliced_df, pagination = paginate_dataframe(df, 0, 50)
    assert pagination["page"] == 1
    assert len(sliced_df) == 50
    assert sliced_df["a"].tolist() == list(range(50))


def test_paginate_dataframe_page_size_below_minimum_clamps_to_one():
    df = pd.DataFrame({"a": range(105)})

    # page_size=0 must not raise ZeroDivisionError.
    sliced_df, pagination = paginate_dataframe(df, 1, 0)
    assert pagination["page_size"] == 1
    assert pagination["total_pages"] == 105
    assert len(sliced_df) == 1
    assert sliced_df["a"].tolist() == [0]


def test_paginate_dataframe_empty_dataframe():
    df = pd.DataFrame({"a": []})

    sliced_df, pagination = paginate_dataframe(df, 1, 50)
    assert len(sliced_df) == 0
    assert pagination["total_rows"] == 0
    assert pagination["total_pages"] == 1
    assert pagination["page"] == 1
    assert pagination["page_size"] == 50
