import os
import copy
import pandas as pd
from   pydantic import BaseModel
from   typing import Self
from   typing import Callable

class SpreadSheetSelector(BaseModel):
    fpath: str
    head_offset: int
    head_cut: int
    tail_cut: int

class SpreadSheet:

    def __init__ (self, data:SpreadSheetSelector, df:pd.DataFrame=None):
        # User defined
        self.fpath = data['fpath']
        if self.fpath == None:
            raise "Error: SpreadSheet: fpath was not given."
        self.head_offset = data['head_offset'] or 0
        self.head_cut = data['head_cut'] or 0
        self.tail_cut = data['tail_cut'] or 0
        # Default values
        self.fname = None
        self.fext = None
        self.__df = df
    
    def __set_df(self, df:pd.DataFrame) -> Self:
        self.__df = df
        return self

    def copy(self) -> Self:
        return copy.deepcopy(self)

    def read(self) -> Self | None:
        self.fname, self.fext = os.path.splitext(os.path.basename(self.fpath))
        df = None
        match self.fext:
            case ".xlsx":
                df = pd.read_excel(self.fpath, header=self.head_offset)
            case ".csv":
                df = pd.read_csv(self.fpath, header=self.head_offset)
            case _:
                return None
        if self.head_cut > 0:
            df = df.iloc[:, self.head_cut:]
        if self.tail_cut > 0:
            df = df[:-self.tail_cut]
        self.__df = df
        return self

    def get_df(self) -> pd.DataFrame:
        return self.__df

    def extract_columns(self, column_names: list[str]) -> Self:
        return self.copy().__set_df(self.__df[column_names])

    def df_opr(self, fn: Callable[[pd.DataFrame], pd.DataFrame]) -> Self:
        return self.copy().__set_df(fn(self.__df))

    def export_parquet(self, path:str) -> Self:
        self.__df.to_parquet(path)
        return self

    def export_csv(self, path:str) -> Self:
        self.__df.to_csv(path)
        return self

    def export_sql(self, engine, name: str) -> 'SpreadSheet':
        self.__df.to_sql(name=name, con=engine, if_exists='replace', index=False)
        return self
