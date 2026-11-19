import pyarrow.fs as pf, pyarrow.dataset as ds, pyarrow.compute as pc, pyarrow as pa
REL="overturemaps-us-west-2/release/2026-11-18.0"
fs=pf.S3FileSystem(anonymous=True, region='us-west-2')
def table(theme, typ, bbox, cols):
    d=ds.dataset(f"{REL}/theme={theme}/type={typ}/", filesystem=fs, format="parquet")
    x0,y0,x1,y1=bbox
    f=(ds.field(("bbox","xmin"))<x1)&(ds.field(("bbox","xmax"))>x0)&(ds.field(("bbox","ymin"))<y1)&(ds.field(("bbox","ymax"))>y0)
    return d.to_table(columns=cols, filter=f)
