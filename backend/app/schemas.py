from pydantic import BaseModel 
from enum import Enum
from typing import Optional, Union, Any, List
import datetime


# Basic Functions
class FilterParameters(BaseModel):
    column: str
    condition: str
    value: str

class SortParameters(BaseModel):
    column: str
    ascending: bool

class Add_or_Del_Row(BaseModel):
    index: int

class Add_or_Del_Column(BaseModel):
    index: int
    name: str

class ChangeCellValue(BaseModel):
    col_index: int   
    row_index: int  
    fill_value: Any   

class FillEmptyParams(BaseModel):
    index: Optional[int]  
    fill_value: Any   


# Complex Functions

class DropDup(str, Enum):
    first = 'first'
    last = 'last'
     
class DropDuplicates(BaseModel):
    columns: str
    keep: Union[DropDup, bool]

class AdvQuery(BaseModel):
    query: str

class AggFunc(str, Enum):
    sum = 'sum'
    mean = 'mean'
    median = 'median'
    min = 'min'
    max = 'max'
    count = 'count'
class Pivot(BaseModel):
    index: str
    column: Optional[str] = None
    value: str
    aggfun: AggFunc
class RevertRequest(BaseModel):
    checkpoint_id: int

# USER LOGS

class ActionTypes(str, Enum):
    filter = 'filter'
    sort = 'sort'
    addRow = 'addRow'
    delRow = 'delRow'
    addCol = 'addCol'
    delCol = 'delCol'
    fillEmpty = 'fillEmpty'
    dropDuplicate = 'dropDuplicate'
    advQueryFilter = 'advQueryFilter'
    pivotTables = 'pivotTables'
    changeCellValue = 'changeCellValue'
class UserLogsAction(BaseModel):
    # user_id: int
    datasetId: int
    actionType: ActionTypes
class UserLogsInput(BaseModel):
    user_actions: Optional[UserLogsAction] = None


class CheckpointResponse(BaseModel):
    id: int
    message: str
    created_at: datetime.datetime

class LogResponse(BaseModel):
    id: int
    action_type: str
    action_details: dict
    timestamp: datetime.datetime
    checkpoint_id: Optional[int]
    applied: bool
class TransformationInput(BaseModel):
    operation_type: str
    parameters: Optional[FilterParameters] = None
    sort_params:Optional[SortParameters] = None
    row_params: Optional[Add_or_Del_Row] = None
    col_params: Optional[Add_or_Del_Column] = None
    fill_empty_params: Optional[FillEmptyParams] = None 
    drop_duplicate: Optional[DropDuplicates] = None
    adv_query: Optional[AdvQuery] = None
    pivot_query: Optional[Pivot] = None
    change_cell_value: Optional[ChangeCellValue] = None
 
class BasicQueryResponse(BaseModel):
    dataset_id: int
    operation_type: str
    row_count: int 
    # result: List[Dict[str, Any]]
    columns: list[str]
    rows: list[list]  # Convert dataframe rows to list of lists

class DatasetResponse(BaseModel):
    filename: str
    file_path: str
    dataset_id: int
    columns: list[str]
    row_count: int
    rows: list[list]

class LastResponse(BaseModel):
    dataset_id: int
    name: str
    description: Optional[str] 
    last_modified: datetime.datetime

    class Config:
        from_attributes = True

 