// Phase 2 互操作测试数据生成器
// 使用官方 Cap'n Proto C++ 库生成测试数据

#include <capnp/message.h>
#include <capnp/serialize.h>
#include <capnp/serialize-packed.h>
#include <fcntl.h>
#include <unistd.h>
#include <iostream>
#include <fstream>
#include <vector>
#include <cstring>

#include "test-schema-phase2.capnp.h"

using namespace capnp;

void writeToFile(const char* filename, kj::ArrayPtr<const kj::byte> data) {
    int fd = open(filename, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        std::cerr << "Failed to open " << filename << std::endl;
        return;
    }
    write(fd, data.begin(), data.size());
    close(fd);
    std::cout << "Written: " << filename << " (" << data.size() << " bytes)" << std::endl;
}

// 生成 Group 类型测试数据
void generateGroupType() {
    MallocMessageBuilder message;
    auto root = message.initRoot<GroupType>();
    root.setId(42);
    root.getName().set("Alice");
    root.getAge().set(30);
    root.getStreet().set("123 Main St");
    root.getCity().set("New York");
    
    auto words = messageToFlatArray(message);
    writeToFile("data/group_type.bin", words.asBytes());
}

// 生成默认值测试数据（使用默认值）
void generateDefaultValuesEmpty() {
    MallocMessageBuilder message;
    auto root = message.initRoot<DefaultValues>();
    // 所有字段使用默认值，不设置任何值
    
    auto words = messageToFlatArray(message);
    writeToFile("data/default_values_empty.bin", words.asBytes());
}

// 生成默认值测试数据（覆盖默认值）
void generateDefaultValuesOverridden() {
    MallocMessageBuilder message;
    auto root = message.initRoot<DefaultValues>();
    root.setInt8WithDefault(100);
    root.setInt32WithDefault(99999);
    root.setUint16WithDefault(500);
    root.setBoolWithDefault(false);
    root.setFloat64WithDefault(2.71828);
    root.setTextWithDefault("overridden text");
    
    auto words = messageToFlatArray(message);
    writeToFile("data/default_values_overridden.bin", words.asBytes());
}

// 生成 Union intVal 变体
void generateUnionIntVal() {
    MallocMessageBuilder message;
    auto root = message.initRoot<UnionType>();
    root.setIntVal(12345);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/union_intval.bin", words.asBytes());
}

// 生成 Union boolVal 变体
void generateUnionBoolVal() {
    MallocMessageBuilder message;
    auto root = message.initRoot<UnionType>();
    root.setBoolVal(true);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/union_boolval.bin", words.asBytes());
}

// 生成复杂嵌套结构
void generateDeepNesting() {
    MallocMessageBuilder message;
    auto root = message.initRoot<DeepNesting>();
    root.setLevel(1);
    root.setData("Level 1 data");
    
    auto child1 = root.initChild();
    child1.setLevel(2);
    child1.setData("Level 2 data");
    
    auto child2 = child1.initChild();
    child2.setLevel(3);
    child2.setData("Level 3 data");
    
    auto words = messageToFlatArray(message);
    writeToFile("data/deep_nesting.bin", words.asBytes());
}

// 生成复杂结构
void generateComplexStruct() {
    MallocMessageBuilder message;
    auto root = message.initRoot<ComplexStruct>();
    root.setId(123456789012345ULL);
    root.setName("Complex Object");
    
    auto tags = root.initTags(3);
    tags.set(0, "tag1");
    tags.set(1, "tag2");
    tags.set(2, "tag3");
    
    auto metadata = root.initMetadata();
    metadata.setCreated(1609459200000ULL);  // 2021-01-01
    metadata.setModified(1609545600000ULL); // 2021-01-02
    
    auto attrs = metadata.initAttributes(2);
    auto attr0 = attrs[0];
    attr0.setKey("author");
    attr0.setValue("test");
    auto attr1 = attrs[1];
    attr1.setKey("version");
    attr1.setValue("1.0");
    
    auto words = messageToFlatArray(message);
    writeToFile("data/complex_struct.bin", words.asBytes());
}

// 生成所有列表类型
void generateAllListTypes() {
    MallocMessageBuilder message;
    auto root = message.initRoot<AllListTypes>();
    
    // Void list
    root.initVoidList(3);
    
    // Bool list
    auto boolList = root.initBoolList(4);
    boolList.set(0, true);
    boolList.set(1, false);
    boolList.set(2, true);
    boolList.set(3, true);
    
    // Int8 list
    auto int8List = root.initInt8List(3);
    int8List.set(0, -128);
    int8List.set(1, 0);
    int8List.set(2, 127);
    
    // Int16 list
    auto int16List = root.initInt16List(3);
    int16List.set(0, -32768);
    int16List.set(1, 0);
    int16List.set(2, 32767);
    
    // Int32 list
    auto int32List = root.initInt32List(3);
    int32List.set(0, -2147483648);
    int32List.set(1, 0);
    int32List.set(2, 2147483647);
    
    // Int64 list
    auto int64List = root.initInt64List(3);
    int64List.set(0, -9223372036854775807LL);
    int64List.set(1, 0);
    int64List.set(2, 9223372036854775807LL);
    
    // UInt8 list
    auto uint8List = root.initUint8List(3);
    uint8List.set(0, 0);
    uint8List.set(1, 128);
    uint8List.set(2, 255);
    
    // UInt16 list
    auto uint16List = root.initUint16List(3);
    uint16List.set(0, 0);
    uint16List.set(1, 32768);
    uint16List.set(2, 65535);
    
    // UInt32 list
    auto uint32List = root.initUint32List(3);
    uint32List.set(0, 0);
    uint32List.set(1, 2147483648U);
    uint32List.set(2, 4294967295U);
    
    // UInt64 list
    auto uint64List = root.initUint64List(3);
    uint64List.set(0, 0);
    uint64List.set(1, 9223372036854775808ULL);
    uint64List.set(2, 18446744073709551615ULL);
    
    // Float32 list
    auto float32List = root.initFloat32List(3);
    float32List.set(0, 0.0f);
    float32List.set(1, 3.14159f);
    float32List.set(2, -2.5f);
    
    // Float64 list
    auto float64List = root.initFloat64List(3);
    float64List.set(0, 0.0);
    float64List.set(1, 2.718281828459045);
    float64List.set(2, 1.4142135623730951);
    
    // Text list
    auto textList = root.initTextList(3);
    textList.set(0, "hello");
    textList.set(1, "world");
    textList.set(2, "");
    
    // Data list
    auto dataList = root.initDataList(2);
    const char data1[] = {0x00, 0x01, 0x02, 0x03};
    const char data2[] = {0xFF, 0xFE, 0xFD};
    dataList.set(0, kj::ArrayPtr<const kj::byte>((const kj::byte*)data1, 4));
    dataList.set(1, kj::ArrayPtr<const kj::byte>((const kj::byte*)data2, 3));
    
    auto words = messageToFlatArray(message);
    writeToFile("data/all_list_types.bin", words.asBytes());
}

// 生成空结构
void generateEmptyStruct() {
    MallocMessageBuilder message;
    message.initRoot<EmptyStruct>();
    
    auto words = messageToFlatArray(message);
    writeToFile("data/empty_struct.bin", words.asBytes());
}

// 生成只有指针的结构
void generatePointerOnlyStruct() {
    MallocMessageBuilder message;
    auto root = message.initRoot<PointerOnlyStruct>();
    root.setName("Test Name");
    const char data[] = {0xDE, 0xAD, 0xBE, 0xEF};
    root.setData(kj::ArrayPtr<const kj::byte>((const kj::byte*)data, 4));
    
    auto words = messageToFlatArray(message);
    writeToFile("data/pointer_only_struct.bin", words.asBytes());
}

// 生成只有数据的结构
void generateDataOnlyStruct() {
    MallocMessageBuilder message;
    auto root = message.initRoot<DataOnlyStruct>();
    root.setId(123456789012345ULL);
    root.setCount(42);
    root.setFlag(true);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/data_only_struct.bin", words.asBytes());
}

// 生成多 Union 测试
void generateMultiUnionInt() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    root.setOptionA(999);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_int.bin", words.asBytes());
}

void generateMultiUnionText() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    root.setOptionB("multi union text");
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_text.bin", words.asBytes());
}

void generateMultiUnionBool() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    root.setOptionC(true);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_bool.bin", words.asBytes());
}

void generateMultiUnionData() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    const char data[] = {0x00, 0x11, 0x22, 0x33, 0x44, 0x55};
    root.setOptionD(kj::ArrayPtr<const kj::byte>((const kj::byte*)data, 6));
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_data.bin", words.asBytes());
}

void generateMultiUnionList() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    auto list = root.initOptionE(5);
    for (int i = 0; i < 5; i++) {
        list.set(i, i * 10);
    }
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_list.bin", words.asBytes());
}

void generateMultiUnionNested() {
    MallocMessageBuilder message;
    auto root = message.initRoot<MultiUnion>();
    auto nested = root.initOptionF();
    nested.setNestedInt(777);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/multi_union_nested.bin", words.asBytes());
}

// 生成边界值
void generateBoundaryValues() {
    MallocMessageBuilder message;
    auto root = message.initRoot<BoundaryValues>();
    root.setInt8Max(127);
    root.setInt8Min(-128);
    root.setInt16Max(32767);
    root.setInt16Min(-32768);
    root.setInt32Max(2147483647);
    root.setInt32Min(-2147483648);
    root.setInt64Max(9223372036854775807LL);
    root.setInt64Min(-9223372036854775807LL - 1);
    root.setUint8Max(255);
    root.setUint16Max(65535);
    root.setUint32Max(4294967295U);
    root.setUint64Max(18446744073709551615ULL);
    
    auto words = messageToFlatArray(message);
    writeToFile("data/boundary_values.bin", words.asBytes());
}

// 生成大消息（用于测试多 segment 处理）
void generateLargeMessage() {
    MallocMessageBuilder message;
    auto root = message.initRoot<LargeMessage>();
    root.setId(999999999ULL);
    
    // 创建较大的 data 字段
    std::vector<kj::byte> largeData(1024);
    for (size_t i = 0; i < largeData.size(); i++) {
        largeData[i] = static_cast<kj::byte>(i & 0xFF);
    }
    root.setData(kj::ArrayPtr<const kj::byte>(largeData.data(), largeData.size()));
    
    // 创建多个 chunks
    auto chunks = root.initChunks(10);
    for (int i = 0; i < 10; i++) {
        auto chunk = chunks[i];
        chunk.setIndex(i);
        std::vector<kj::byte> chunkData(512);
        for (size_t j = 0; j < chunkData.size(); j++) {
            chunkData[j] = static_cast<kj::byte>((i * 100 + j) & 0xFF);
        }
        chunk.setContent(kj::ArrayPtr<const kj::byte>(chunkData.data(), chunkData.size()));
    }
    
    auto words = messageToFlatArray(message);
    writeToFile("data/large_message.bin", words.asBytes());
}

int main() {
    std::cout << "Generating Phase 2 interop test data..." << std::endl;
    
    generateGroupType();
    generateDefaultValuesEmpty();
    generateDefaultValuesOverridden();
    generateUnionIntVal();
    generateUnionBoolVal();
    generateDeepNesting();
    generateComplexStruct();
    generateAllListTypes();
    generateEmptyStruct();
    generatePointerOnlyStruct();
    generateDataOnlyStruct();
    generateMultiUnionInt();
    generateMultiUnionText();
    generateMultiUnionBool();
    generateMultiUnionData();
    generateMultiUnionList();
    generateMultiUnionNested();
    generateBoundaryValues();
    generateLargeMessage();
    
    std::cout << "All test data generated successfully!" << std::endl;
    return 0;
}
