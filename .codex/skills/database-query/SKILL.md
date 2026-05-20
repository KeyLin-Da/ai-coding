---
name: database-query
description: Connect to various databases and execute read-only SQL queries safely. Supports MySQL, PostgreSQL, SQLite, Oracle, and SQL Server. Use when querying database data, exploring schemas, validating data states, or generating data reports. Automatically detects database type from connection URL and blocks all data modification operations (INSERT/UPDATE/DELETE/DROP/etc).
---

# Database Query Tool

安全连接多种数据库并执行只读查询的工具。

## 核心原则

**禁止任何数据修改操作** - 阻止 INSERT/UPDATE/DELETE/DROP/CREATE/ALTER 等所有修改数据的语句,但允许所有只读查询(SELECT/SHOW/DESCRIBE/EXPLAIN 等)

## 支持的数据库

- **MySQL** (5.7+, 8.0+)
- **PostgreSQL** (12+)
- **SQLite** (3.x)
- **Oracle** (12c+)
- **SQL Server** (2016+)

## 快速开始

### 1. 配置数据源（推荐）

**步骤 1: 创建配置文件**

复制示例配置文件并修改:

```bash
cp datasources.yaml.example datasources.yaml
```

**步骤 2: 编辑配置文件**

在 `datasources.yaml` 中配置您的数据源:

```yaml
datasources:
  opp_user:
    db_type: mysql
    url: jdbc:mysql://localhost:3306/opp_user?useSSL=false&serverTimezone=UTC
    username: readonly
    password: ${DB_PASSWORD}  # 使用环境变量
    description: "用户中心数据库"
```

**步骤 3: 使用配置文件执行查询**

```bash
python scripts/db_query.py \
  --config datasources.yaml \
  --datasource opp_user \
  --query "SELECT id, username FROM users LIMIT 10"
```

### 2. 命令行直接指定（备选）

如果不使用配置文件，可以直接在命令行中指定连接信息:

**MySQL:**
```
jdbc:mysql://host:port/database?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
```

**PostgreSQL:**
```
jdbc:postgresql://host:port/database?ssl=false&connectTimeout=10
```

**SQLite:**
```
jdbc:sqlite:/path/to/database.db
```

**Oracle:**
```
jdbc:oracle:thin:@host:port:sid
```

**SQL Server:**
```
jdbc:sqlserver://host:port;databaseName=db;encrypt=false
```

### 3. 执行查询

使用 Python 脚本执行查询:

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/mydb" \
  --username user \
  --password pass \
  --query "SELECT * FROM users LIMIT 10"
```

## 安全限制

### 自动拦截修改操作

在执行前验证 SQL 语句,禁止所有数据修改:

```python
def validate_readonly_query(sql: str) -> tuple[bool, str]:
    """验证是否为只读查询,禁止修改操作"""
    sql_upper = sql.strip().upper()
    
    # 禁止的修改操作关键字
    forbidden_keywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
        'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'MERGE',
        'REPLACE', 'LOAD DATA', 'CALL'  # 存储过程可能修改数据
    ]
    
    # 检查是否包含禁止的关键字
    for keyword in forbidden_keywords:
        if keyword in sql_upper:
            return False, f"禁止的操作: {keyword} - 此工具仅支持只读查询"
    
    return True, "验证通过"
```

### 查询超时限制

默认设置 30 秒超时,防止长时间运行的查询:

```python
cursor.execute(query, timeout=30)
```

### 结果集大小限制

默认限制返回 10000 行,避免内存溢出:

```python
LIMIT 10000
```

## 允许的查询类型

✅ **SELECT** - 数据查询
✅ **WITH** - CTE 公共表表达式
✅ **SHOW** - 显示数据库信息(MySQL)
✅ **DESCRIBE / DESC** - 查看表结构
✅ **EXPLAIN** - 查询执行计划
✅ **PRAGMA** - SQLite 配置查询
✅ **information_schema** - 系统表查询
✅ **pg_catalog** - PostgreSQL 系统表查询

## 禁止的操作

❌ **INSERT** - 插入数据
❌ **UPDATE** - 更新数据
❌ **DELETE** - 删除数据
❌ **DROP** - 删除表/数据库
❌ **CREATE** - 创建表/索引等
❌ **ALTER** - 修改表结构
❌ **TRUNCATE** - 清空表
❌ **GRANT/REVOKE** - 权限管理
❌ **MERGE** - 合并操作
❌ **CALL** - 调用存储过程(可能修改数据)

## 常用查询模板

### 查看表列表

**MySQL/PostgreSQL:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

**SQLite:**
```sql
SELECT name FROM sqlite_master WHERE type='table';
```

### 查看表结构

**MySQL:**
```sql
DESCRIBE table_name;
-- 或
SHOW COLUMNS FROM table_name;
```

**PostgreSQL:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'table_name'
ORDER BY ordinal_position;
```

### 统计行数

```sql
SELECT COUNT(*) as total_rows FROM table_name;
```

### 查看最近记录

```sql
SELECT * FROM table_name 
ORDER BY created_time DESC 
LIMIT 20;
```

### 数据分布分析

```sql
SELECT 
    column_name,
    COUNT(*) as count,
    COUNT(DISTINCT column_name) as distinct_count
FROM table_name
GROUP BY column_name
ORDER BY count DESC
LIMIT 50;
```

### 查看索引信息

**MySQL:**
```sql
SHOW INDEX FROM table_name;
```

**PostgreSQL:**
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'table_name';
```

### 查询执行计划

```sql
EXPLAIN SELECT * FROM users WHERE status = 1;
```

## 输出格式

查询结果以表格形式输出:

```
查询结果 (共 5 行):
+----+----------+------------------+---------------------+
| id | username | email            | created_time        |
+----+----------+------------------+---------------------+
| 1  | admin    | admin@test.com   | 2024-01-01 10:00:00 |
| 2  | user1    | user1@test.com   | 2024-01-02 11:30:00 |
| 3  | user2    | user2@test.com   | 2024-01-03 09:15:00 |
| 4  | user3    | user3@test.com   | 2024-01-04 14:20:00 |
| 5  | user4    | user4@test.com   | 2024-01-05 16:45:00 |
+----+----------+------------------+---------------------+

执行时间: 0.023s
```

## 错误处理

### 连接失败

```
错误: 无法连接到数据库
原因: 认证失败 / 网络不通 / 数据库未启动
建议: 检查连接参数和网络连通性
```

### 查询被拒绝(修改操作)

```
❌ 查询验证失败: 禁止的操作: UPDATE - 此工具仅支持只读查询
提示: 请勿尝试修改数据,如需修改请联系 DBA
```

### 查询语法错误

```
错误: SQL 语法错误
详细信息: <数据库返回的具体错误>
建议: 检查 SQL 语法和表名/字段名是否正确
```

### 权限不足

```
错误: 访问被拒绝
原因: 用户没有该表的查询权限
建议: 联系 DBA 授予 SELECT 权限
```

## 实用脚本

### db_query.py

完整的数据库查询工具脚本:

```python
#!/usr/bin/env python3
"""
数据库只读查询工具
支持: MySQL, PostgreSQL, SQLite, Oracle, SQL Server
禁止: 所有数据修改操作 (INSERT/UPDATE/DELETE/DROP/CREATE/ALTER等)
"""

import argparse
import os
import sys
import time
from typing import Optional


def validate_readonly_query(sql: str) -> tuple[bool, str]:
    """验证是否为只读查询,禁止修改操作"""
    sql_upper = sql.strip().upper()
    
    # 禁止的修改操作关键字
    forbidden_keywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
        'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'MERGE',
        'REPLACE', 'LOAD DATA'
    ]
    
    # 检查是否包含禁止的关键字
    for keyword in forbidden_keywords:
        if keyword in sql_upper:
            return False, f"禁止的操作: {keyword} - 此工具仅支持只读查询"
    
    return True, "验证通过"


def format_table(headers: list, rows: list, max_width: int = 50) -> str:
    """格式化表格输出"""
    if not rows:
        return "查询结果为空"
    
    # 计算每列宽度
    col_widths = [len(str(h)) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            cell_str = str(cell) if cell is not None else 'NULL'
            col_widths[i] = min(max(col_widths[i], len(cell_str)), max_width)
    
    # 构建分隔线
    separator = '+' + '+'.join('-' * (w + 2) for w in col_widths) + '+'
    
    # 构建表头
    header_line = '|' + '|'.join(f' {str(h).ljust(w)} ' for h, w in zip(headers, col_widths)) + '|'
    
    # 构建数据行
    data_lines = []
    for row in rows:
        cells = []
        for cell, width in zip(row, col_widths):
            cell_str = str(cell) if cell is not None else 'NULL'
            if len(cell_str) > width:
                cell_str = cell_str[:width-3] + '...'
            cells.append(f' {cell_str.ljust(width)} ')
        data_lines.append('|' + '|'.join(cells) + '|')
    
    # 组合输出
    result = [separator, header_line, separator] + data_lines + [separator]
    return '\n'.join(result)


def query_mysql(url: str, username: str, password: str, query: str, limit: int = 10000):
    """执行 MySQL 查询"""
    try:
        import pymysql
    except ImportError:
        print("需要安装 pymysql: pip install pymysql")
        sys.exit(1)
    
    from urllib.parse import urlparse
    parsed = urlparse(url.replace('jdbc:', ''))
    
    conn = None
    try:
        conn = pymysql.connect(
            host=parsed.hostname or 'localhost',
            port=parsed.port or 3306,
            user=username,
            password=password,
            database=parsed.path.lstrip('/'),
            connect_timeout=10,
            read_timeout=30
        )
        
        with conn.cursor() as cursor:
            # 添加 LIMIT 如果查询中没有且是 SELECT
            if 'SELECT' in query.upper() and 'LIMIT' not in query.upper():
                query = f"{query.rstrip(';')} LIMIT {limit}"
            
            start_time = time.time()
            cursor.execute(query)
            elapsed = time.time() - start_time
            
            headers = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            
            return headers, rows, elapsed
    
    finally:
        if conn:
            conn.close()


def query_postgresql(url: str, username: str, password: str, query: str, limit: int = 10000):
    """执行 PostgreSQL 查询"""
    try:
        import psycopg2
    except ImportError:
        print("需要安装 psycopg2-binary: pip install psycopg2-binary")
        sys.exit(1)
    
    from urllib.parse import urlparse
    parsed = urlparse(url.replace('jdbc:', ''))
    
    conn = None
    try:
        conn = psycopg2.connect(
            host=parsed.hostname or 'localhost',
            port=parsed.port or 5432,
            user=username,
            password=password,
            dbname=parsed.path.lstrip('/'),
            connect_timeout=10
        )
        
        with conn.cursor() as cursor:
            if 'SELECT' in query.upper() and 'LIMIT' not in query.upper():
                query = f"{query.rstrip(';')} LIMIT {limit}"
            
            start_time = time.time()
            cursor.execute(query)
            elapsed = time.time() - start_time
            
            headers = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            
            return headers, rows, elapsed
    
    finally:
        if conn:
            conn.close()


def query_sqlite(db_path: str, query: str, limit: int = 10000):
    """执行 SQLite 查询"""
    try:
        import sqlite3
    except ImportError:
        print("需要安装 sqlite3: pip install pysqlite3")
        sys.exit(1)
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        
        cursor = conn.cursor()
        
        if 'SELECT' in query.upper() and 'LIMIT' not in query.upper():
            query = f"{query.rstrip(';')} LIMIT {limit}"
        
        start_time = time.time()
        cursor.execute(query)
        elapsed = time.time() - start_time
        
        headers = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        
        return headers, rows, elapsed
    
    finally:
        if conn:
            conn.close()


def load_datasource_from_config(config_file: str, datasource_name: str) -> dict:
    """从 YAML 配置文件加载数据源配置"""
    try:
        import yaml
    except ImportError:
        print("需要安装 PyYAML: pip install pyyaml")
        sys.exit(1)
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        datasources = config.get('datasources', {})
        if datasource_name not in datasources:
            print(f"❌ 错误: 未找到数据源 '{datasource_name}'")
            print(f"可用的数据源: {', '.join(datasources.keys())}")
            sys.exit(1)
        
        ds = datasources[datasource_name]
        
        # 处理环境变量替换
        if 'password' in ds and ds['password'].startswith('${') and ds['password'].endswith('}'):
            env_var = ds['password'][2:-1]
            ds['password'] = os.environ.get(env_var, '')
            if not ds['password']:
                print(f"⚠️  警告: 环境变量 {env_var} 未设置")
        
        return ds
        
    except FileNotFoundError:
        print(f"❌ 错误: 配置文件不存在: {config_file}")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"❌ 错误: YAML 解析失败: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='数据库只读查询工具(禁止修改操作)')
    
    # 配置文件方式
    parser.add_argument('--config', help='YAML 配置文件路径')
    parser.add_argument('--datasource', help='数据源名称(配合 --config 使用)')
    
    # 命令行直接指定方式
    parser.add_argument('--db-type', choices=['mysql', 'postgresql', 'sqlite'],
                       help='数据库类型')
    parser.add_argument('--url', help='JDBC URL (MySQL/PostgreSQL)')
    parser.add_argument('--db-path', help='数据库文件路径 (SQLite)')
    parser.add_argument('--username', help='用户名')
    parser.add_argument('--password', help='密码')
    
    parser.add_argument('--query', required=True, help='SQL 查询语句')
    parser.add_argument('--limit', type=int, default=10000, help='最大返回行数')
    
    args = parser.parse_args()
    
    # 验证参数:必须提供配置文件或命令行参数
    if args.config and args.datasource:
        # 从配置文件加载数据源
        ds = load_datasource_from_config(args.config, args.datasource)
        args.db_type = ds.get('db_type')
        args.url = ds.get('url')
        args.db_path = ds.get('db_path')
        args.username = ds.get('username')
        args.password = ds.get('password')
        
        print(f"📋 使用数据源: {args.datasource}")
        if 'description' in ds:
            print(f"   描述: {ds['description']}")
        print()
    elif not args.db_type:
        print("❌ 错误: 请提供 --config 和 --datasource，或直接指定 --db-type")
        sys.exit(1)
    
    # 验证查询 - 禁止修改操作
    is_valid, message = validate_readonly_query(args.query)
    if not is_valid:
        print(f"❌ {message}")
        sys.exit(1)
    
    print(f"✅ 查询验证通过")
    print(f"📊 执行查询: {args.query}")
    print()
    
    try:
        # 执行查询
        if args.db_type == 'mysql':
            headers, rows, elapsed = query_mysql(
                args.url, args.username, args.password, args.query, args.limit
            )
        elif args.db_type == 'postgresql':
            headers, rows, elapsed = query_postgresql(
                args.url, args.username, args.password, args.query, args.limit
            )
        elif args.db_type == 'sqlite':
            headers, rows, elapsed = query_sqlite(
                args.db_path, args.query, args.limit
            )
        
        # 输出结果
        if headers:
            print(f"查询结果 (共 {len(rows)} 行):")
            print(format_table(headers, rows))
            print()
        else:
            print("查询执行成功(无返回数据)")
            print()
        
        print(f"⏱️  执行时间: {elapsed:.3f}s")
        
    except Exception as e:
        print(f"❌ 查询执行失败:")
        print(f"   错误类型: {type(e).__name__}")
        print(f"   错误信息: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
```

## 使用示例

### 示例 1: 使用 YAML 配置文件

```bash
python scripts/db_query.py \
  --config datasources.yaml \
  --datasource opp_user \
  --query "SELECT id, username, email FROM users WHERE status = 1 LIMIT 10"
```

### 示例 2: MySQL 基础查询（命令行方式）

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/opp_user" \
  --username root \
  --password secret \
  --query "SELECT id, username, email FROM users WHERE status = 1 LIMIT 10"
```

### 示例 2: PostgreSQL 统计分析

```bash
python scripts/db_query.py \
  --db-type postgresql \
  --url "jdbc:postgresql://localhost:5432/analytics" \
  --username analyst \
  --password pass123 \
  --query "SELECT date_trunc('day', created_at) as day, COUNT(*) as count FROM orders GROUP BY day ORDER BY day DESC LIMIT 30"
```

### 示例 3: SQLite 本地查询

```bash
python scripts/db_query.py \
  --db-type sqlite \
  --db-path "./data/local.db" \
  --query "SELECT name, type FROM sqlite_master WHERE type='table'"
```

### 示例 4: 查看表结构

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/opp_material" \
  --username readonly \
  --password readonly123 \
  --query "DESCRIBE mat_material_info"
```

### 示例 5: SHOW 命令

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/opp_user" \
  --username readonly \
  --password readonly123 \
  --query "SHOW TABLES"
```

### 示例 6: EXPLAIN 执行计划

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/opp_user" \
  --username readonly \
  --password readonly123 \
  --query "EXPLAIN SELECT * FROM users WHERE user_id = 123"
```

### 示例 7: 被拒绝的修改操作

```bash
python scripts/db_query.py \
  --db-type mysql \
  --url "jdbc:mysql://localhost:3306/opp_user" \
  --username readonly \
  --password readonly123 \
  --query "UPDATE users SET status = 0 WHERE id = 1"
```

输出:
```
❌ 禁止的操作: UPDATE - 此工具仅支持只读查询
```

## 最佳实践

### 1. 使用 YAML 配置文件管理数据源

**创建独立配置文件:**

```bash
# 复制示例文件
cp datasources.yaml.example datasources.yaml

# 编辑配置
vim datasources.yaml
```

**配置文件结构:**

```yaml
datasources:
  production_user:
    db_type: mysql
    url: jdbc:mysql://prod-db.example.com:3306/opp_user?useSSL=true
    username: readonly
    password: ${PROD_DB_PASSWORD}  # 使用环境变量
    description: "生产环境用户数据库"
  
  staging_user:
    db_type: mysql
    url: jdbc:mysql://staging-db.example.com:3306/opp_user?useSSL=false
    username: readonly
    password: ${STAGING_DB_PASSWORD}
    description: "测试环境用户数据库"
```

**安全提示:**
- 将 `datasources.yaml` 加入 `.gitignore`，不要提交到版本控制
- 使用环境变量存储敏感信息: `export PROD_DB_PASSWORD="your_password"`
- 为不同环境创建不同的配置文件: `datasources.prod.yaml`, `datasources.dev.yaml`

### 2. 使用只读账号

始终使用具有最小权限的只读账号:

```sql
-- MySQL 创建只读用户
CREATE USER 'readonly'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT ON database_name.* TO 'readonly'@'%';
FLUSH PRIVILEGES;
```

### 2. 避免 SELECT *

明确指定需要的字段:

```sql
-- ❌ 不推荐
SELECT * FROM users;

-- ✅ 推荐
SELECT id, username, email FROM users;
```

### 3. 使用 LIMIT

对于 SELECT 查询,始终限制返回行数:

```sql
SELECT * FROM large_table LIMIT 100;
```

### 4. 添加索引提示

对于大表查询,考虑添加索引:

```sql
-- 先查看执行计划
EXPLAIN SELECT * FROM orders WHERE user_id = 123;
```

### 5. 分批查询大数据

对于大量数据,使用分页:

```sql
-- 第1页
SELECT * FROM logs ORDER BY id LIMIT 1000 OFFSET 0;

-- 第2页
SELECT * FROM logs ORDER BY id LIMIT 1000 OFFSET 1000;
```

## 故障排查

### 问题: 连接超时

**解决方案:**
- 检查网络连接
- 验证防火墙规则
- 确认数据库服务正在运行
- 增加超时时间

### 问题: 认证失败

**解决方案:**
- 检查用户名和密码
- 确认用户有远程访问权限
- 验证数据库允许的连接方式

### 问题: 查询性能慢

**解决方案:**
- 使用 EXPLAIN 分析执行计划
- 添加适当的索引
- 优化查询条件
- 减少返回列数

### 问题: 查询被拒绝

**解决方案:**
- 确认没有使用禁止的关键字(INSERT/UPDATE/DELETE等)
- 如需修改数据,请使用专门的数据库管理工具
- 联系 DBA 进行数据修改操作

## 相关资源

- 对于复杂的数据库管理任务,参考 [reference.md](reference.md)
- 查看更多查询示例,参考 [examples.md](examples.md)
