import duckdb, json, sys
R="s3://overturemaps-us-west-2/release/2026-11-18.0"
con=duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
bb="bbox.xmin>-50.26 and bbox.xmax<-50.06 and bbox.ymin>-25.18 and bbox.ymax<-25.03"
print("PLACES")
for r in con.execute(f"select names.primary, round((bbox.xmin+bbox.xmax)/2,5), round((bbox.ymin+bbox.ymax)/2,5), categories.primary from read_parquet('{R}/theme=places/type=place/*', hive_partitioning=1) where {bb} and (lower(names.primary) like '%esquadr%' or lower(names.primary) like '%resgatando%')").fetchall(): print(r)
print("SEGMENTS")
rows=con.execute(f"select names.primary, subtype, class, count(*) from read_parquet('{R}/theme=transportation/type=segment/*', hive_partitioning=1) where {bb} and (lower(names.primary) like '%holzmann%' or lower(names.primary) like '%silva jardim%' or lower(names.primary) like '%14 de julho%' or lower(names.primary) like '%vereadores%') group by 1,2,3 order by 1").fetchall()
for r in rows: print(r)
