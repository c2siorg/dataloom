import streamlit as st
import pandas as pd
from fun import select, get_numeric_cols, get_min_max, filter_number, dropna, group, info, describe

st.title("DataLoom PoC 💡")
data = pd.read_csv("./data/Titanic-Dataset.csv")
st.markdown("""
    <style>
        .reportview-container .main .block-container {
            max-width: 1200px;
            padding-top: 2rem;
            padding-right: 2rem;
            padding-left: 2rem;
            padding-bottom: 3rem;
        }
    </style>
""", unsafe_allow_html=True)

config = st.sidebar()
main_block = st.empty()

with config:
    all_cols = list(data.columns)
    select_cols = st.multiselect('SELECT columns:', all_cols, default=all_cols)
    out = select(data, select_cols)
    st.write("Filter:")
    num_cols = get_numeric_cols(out)
    for col in num_cols:
        mini, maxi = get_min_max(out, col)
        start_num, end_num = st.slider(col, min_value=mini, max_value=maxi, value=(mini, maxi))
        out = filter_number(out, col, start_num, end_num)

    all_cols = list(out.columns)
    by = st.multiselect('Group By:', all_cols, default=[])
    if len(by)>0:
        funcs = st.multiselect('Functions:', ['sum', 'min', 'max'], default=['sum'])
        out = group(out, by, funcs)

with main_block:
    st.write(out)
    st.write(describe(out))
    if len(by)==0:
        st.write(info(out))