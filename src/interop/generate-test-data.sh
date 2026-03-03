#!/bin/bash
# 生成互操作测试数据
# 这个脚本使用官方 capnp 工具生成测试数据

set -e

cd "$(dirname "$0")"

echo "=== Interop Test Data Generation ==="

# 检查 capnp 是否安装
if ! command -v capnp &> /dev/null; then
    echo "Error: capnp not found. Please install Cap'n Proto."
    exit 1
fi

echo "Cap'n Proto version: $(capnp --version)"

# 编译 schema
echo ""
echo "=== Compiling schemas ==="
capnp compile -oc++ test-schema.capnp 2>/dev/null || echo "Schema 1 already compiled or error"
capnp compile -oc++ test-schema-extended.capnp 2>/dev/null || echo "Schema 2 compilation skipped (may need manual C++ compilation)"

# 创建数据目录
mkdir -p data

# 使用 capnp convert 从文本格式生成二进制数据
# 注意：这需要 schema 编译后的二进制格式

echo ""
echo "=== Generating test data using capnp convert ==="

# GroupType
cat > /tmp/group_type.txt << 'EOF'
(id = 42, name = "Alice", age = 30, street = "123 Main St", city = "New York")
EOF
capnp convert text:binary test-schema-extended.capnp GroupType < /tmp/group_type.txt > data/group_type.bin 2>/dev/null || echo "GroupType: skipped (needs C++ generator)"

# Union intVal
cat > /tmp/union_intval.txt << 'EOF'
(intVal = 12345)
EOF
capnp convert text:binary test-schema.capnp UnionType < /tmp/union_intval.txt > data/union_intval.bin 2>/dev/null || echo "Union intVal: skipped (needs C++ generator)"

# Union boolVal
cat > /tmp/union_boolval.txt << 'EOF'
(boolVal = true)
EOF
capnp convert text:binary test-schema.capnp UnionType < /tmp/union_boolval.txt > data/union_boolval.bin 2>/dev/null || echo "Union boolVal: skipped (needs C++ generator)"

# Empty struct
cat > /tmp/empty_struct.txt << 'EOF'
()
EOF
capnp convert text:binary test-schema-extended.capnp EmptyStruct < /tmp/empty_struct.txt > data/empty_struct.bin 2>/dev/null || echo "EmptyStruct: skipped (needs C++ generator)"

# Data only struct
cat > /tmp/data_only.txt << 'EOF'
(id = 123456789012345, count = 42, flag = true)
EOF
capnp convert text:binary test-schema-extended.capnp DataOnlyStruct < /tmp/data_only.txt > data/data_only_struct.bin 2>/dev/null || echo "DataOnlyStruct: skipped (needs C++ generator)"

# Pointer only struct
cat > /tmp/pointer_only.txt << 'EOF'
(name = "Test Name", data = 0x"DEADBEEF")
EOF
capnp convert text:binary test-schema-extended.capnp PointerOnlyStruct < /tmp/pointer_only.txt > data/pointer_only_struct.bin 2>/dev/null || echo "PointerOnlyStruct: skipped (needs C++ generator)"

# Boundary values
cat > /tmp/boundary_values.txt << 'EOF'
(int8Max = 127, int8Min = -128,
 int16Max = 32767, int16Min = -32768,
 int32Max = 2147483647, int32Min = -2147483648,
 int64Max = 9223372036854775807, int64Min = -9223372036854775808,
 uint8Max = 255, uint16Max = 65535,
 uint32Max = 4294967295, uint64Max = 18446744073709551615)
EOF
capnp convert text:binary test-schema-extended.capnp BoundaryValues < /tmp/boundary_values.txt > data/boundary_values.bin 2>/dev/null || echo "BoundaryValues: skipped (needs C++ generator)"

# Default values empty (all defaults)
cat > /tmp/default_empty.txt << 'EOF'
()
EOF
capnp convert text:binary test-schema-extended.capnp DefaultValues < /tmp/default_empty.txt > data/default_values_empty.bin 2>/dev/null || echo "DefaultValues empty: skipped (needs C++ generator)"

# Default values overridden
cat > /tmp/default_overridden.txt << 'EOF'
(int8WithDefault = 100, int32WithDefault = 99999, uint16WithDefault = 500,
 boolWithDefault = false, float64WithDefault = 2.71828,
 textWithDefault = "overridden text")
EOF
capnp convert text:binary test-schema-extended.capnp DefaultValues < /tmp/default_overridden.txt > data/default_values_overridden.bin 2>/dev/null || echo "DefaultValues overridden: skipped (needs C++ generator)"

echo ""
echo "=== Checking generated files ==="
ls -la data/

echo ""
echo "=== Done ==="
echo ""
echo "Note: Some test data requires C++ compilation."
echo "To generate all test data with C++:"
echo "  1. Install capnproto C++ library"
echo "  2. Run: make && ./generate-test-data" 2>/dev/null || echo "PointerOnlyStruct: skipped (needs C++ generator)"

# Boundary values
cat > /tmp/boundary_values.txt << 'EOF'
(int8Max = 127, int8Min = -128,
 int16Max = 32767, int16Min = -32768,
 int32Max = 2147483647, int32Min = -2147483648,
 int64Max = 9223372036854775807, int64Min = -9223372036854775808,
 uint8Max = 255, uint16Max = 65535,
 uint32Max = 4294967295, uint64Max = 18446744073709551615)
EOF
capnp convert text:binary test-schema-phase2.capnp BoundaryValues < /tmp/boundary_values.txt > data/boundary_values.bin 2>/dev/null || echo "BoundaryValues: skipped (needs C++ generator)"

# Default values empty (all defaults)
cat > /tmp/default_empty.txt << 'EOF'
()
EOF
capnp convert text:binary test-schema-phase2.capnp DefaultValues < /tmp/default_empty.txt > data/default_values_empty.bin 2>/dev/null || echo "DefaultValues empty: skipped (needs C++ generator)"

# Default values overridden
cat > /tmp/default_overridden.txt << 'EOF'
(int8WithDefault = 100, int32WithDefault = 99999, uint16WithDefault = 500,
 boolWithDefault = false, float64WithDefault = 2.71828,
 textWithDefault = "overridden text")
EOF
capnp convert text:binary test-schema-phase2.capnp DefaultValues < /tmp/default_overridden.txt > data/default_values_overridden.bin 2>/dev/null || echo "DefaultValues overridden: skipped (needs C++ generator)"

echo ""
echo "=== Checking generated files ==="
ls -la data/

echo ""
echo "=== Done ==="
echo ""
echo "Note: Some test data requires C++ compilation."
echo "To generate all test data with C++:"
echo "  1. Install capnproto C++ library"
echo "  2. Run: make && ./generate-phase2"
