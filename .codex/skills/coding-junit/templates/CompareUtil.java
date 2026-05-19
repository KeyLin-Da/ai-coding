package ${PACKAGE_PATH}.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.macula.boot.result.PageVO;
import org.springframework.util.CollectionUtils;

import java.lang.reflect.Field;
import java.util.*;

/**
 * 对象对比工具类 - 用于接口优化前后数据一致性验证
 * 
 * @author key.lin
 * @create 2026/1/22 15:59
 */
public class CompareUtil {

    /**
     * 比较新旧分页实现结果
     *
     * @param newResults 新实现结果
     * @param oldResults 旧实现结果
     * @param clazz 数据类型
     * @param <T> 泛型类型
     * @return 是否一致
     */
    public static <T> Boolean comparePageResults(PageVO<T> newResults, PageVO<T> oldResults, Class<T> clazz) {
        // 步骤1：获取本地优化后的数据
        System.out.println("========== 获取本地优化后的数据 ==========");
        System.out.println("本地数据总数: " + (newResults != null ? newResults.getTotal() : 0));
        System.out.println("本地数据记录数: " + (newResults != null && newResults.getRecords() != null ? newResults.getRecords().size() : 0));

        // 步骤2：从测试环境接口获取优化前的数据
        System.out.println("\n========== 获取测试环境优化前的数据 ==========");

        System.out.println("测试环境数据总数: " + (oldResults != null ? oldResults.getTotal() : 0));
        System.out.println("测试环境数据记录数: " + (oldResults != null && oldResults.getRecords() != null ? oldResults.getRecords().size() : 0));

        // 步骤3：对比数据一致性
        System.out.println("\n========== 数据一致性对比 ==========");
        return CompareUtil.compare(newResults.getRecords(), oldResults.getRecords(), clazz);
    }

    /**
     * 通用对比方法，支持 List、Map 和单个对象
     */
    public static <T> Boolean compare(Object oldObj, Object newObj, Class<T> clazz) {
        if (oldObj == null && newObj == null) {
            System.out.println("✓ 数据一致性对比---结果一致: 双方都返回空结果");
            return true;
        }

        if (oldObj == null || newObj == null) {
            System.out.println("✗ 数据一致性对比---结果不一致: 一方返回空结果，另一方有数据");
            return false;
        }

        if (oldObj instanceof List && newObj instanceof List) {
            return compareLists((List<?>) oldObj, (List<?>) newObj, clazz);
        } else if (oldObj instanceof Map && newObj instanceof Map) {
            return compareMaps((Map<?, ?>) oldObj, (Map<?, ?>) newObj);
        } else {
            return compareObjects(oldObj, newObj, clazz);
        }
    }

    private static <T> Boolean compareLists(List<?> oldList, List<?> newList, Class<T> clazz) {
        if (CollectionUtils.isEmpty(oldList) && CollectionUtils.isEmpty(newList)) {
            System.out.println("✓ 数据一致性对比---结果一致: 双方都返回空结果");
            return true;
        }

        if (CollectionUtils.isEmpty(oldList) || CollectionUtils.isEmpty(newList)) {
            System.out.println("✗ 数据一致性对比---结果不一致: 一方返回空结果，另一方有数据");
            return false;
        }

        if (oldList.size() != newList.size()) {
            System.out.println("✗ 数据一致性对比---结果数量不一致: 旧实现=" + oldList.size() + ", 新实现=" + newList.size());
            return false;
        }

        boolean allMatched = true;
        for (int i = 0; i < oldList.size(); i++) {
            Object oldItem = oldList.get(i);
            Object newItem = newList.get(i);

            if (!compareObjects(oldItem, newItem, clazz)) {
                allMatched = false;
            }
        }

        if (allMatched) {
            System.out.println("✓ 数据一致性对比---所有结果匹配: 旧实现和新实现返回的数据完全一致");
            return true;
        } else {
            System.out.println("✗ 数据一致性对比---存在不匹配的数据");
            return false;
        }
    }

    private static Boolean compareMaps(Map<?, ?> oldMap, Map<?, ?> newMap) {
        if (oldMap.size() != newMap.size()) {
            System.out.println("✗ 数据一致性对比---结果数量不一致: 旧实现=" + oldMap.size() + ", 新实现=" + newMap.size());
            return false;
        }

        for (Map.Entry<?, ?> entry : oldMap.entrySet()) {
            Object key = entry.getKey();
            Object oldValue = entry.getValue();
            Object newValue = newMap.get(key);

            if (!Objects.equals(oldValue, newValue)) {
                System.out.println("✗ 数据一致性对比---字段[" + key + "]不一致: 旧=" + oldValue + ", 新=" + newValue);
                return false;
            }
        }

        System.out.println("✓ 数据一致性对比---所有结果匹配: 旧实现和新实现返回的数据完全一致");
        return true;
    }

    private static <T> Boolean compareObjects(Object oldObj, Object newObj, Class<T> clazz) {
        if (!clazz.isInstance(oldObj) || !clazz.isInstance(newObj)) {
            System.out.println("✗ 数据一致性对比---对象类型不匹配");
            return false;
        }

        boolean allMatched = true;
        Field[] fields = clazz.getDeclaredFields();
        for (Field field : fields) {
            field.setAccessible(true);
            try {
                Object oldValue = field.get(oldObj);
                Object newValue = field.get(newObj);

                if (!Objects.equals(oldValue, newValue)) {
                    System.out.println("✗ 数据一致性对比---字段[" + field.getName() + "]不一致: 旧=" + oldValue + ", 新=" + newValue);
                    allMatched = false;
                }
            } catch (IllegalAccessException e) {
                System.err.println("数据一致性对比---无法访问字段: " + field.getName());
                allMatched = false;
            }
        }

        return allMatched;
    }
    
    /**
     * 基于MD5的JSON字符串对比
     */
    public static <T> Boolean compareMd5Results(T oldResults, T newResults) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            mapper.registerModule(new JavaTimeModule());
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            String oldJsonString = mapper.writeValueAsString(oldResults);
            String newJsonString = mapper.writeValueAsString(newResults);
            if (oldJsonString.equals(newJsonString)) {
                System.out.println("✓ MD5数据一致性对比---结果一致: 两个结果JSON字符串一致");
                return true;
            } else {
                System.out.println("✗ MD5数据一致性对比---结果不一致: 两个结果JSON字符串不一致");
                return false;
            }
        } catch (Exception e) {
            System.out.println("MD5数据一致性对比---JSON处理异常");
        }
        return false;
    }
    
    /**
     * 深度对比任意对象，支持Map、List、普通对象等嵌套结构
     *
     * @param oldObj 旧对象
     * @param newObj 新对象
     * @return 对比结果，true表示一致，false表示存在差异
     */
    public static Boolean deepCompare(Object oldObj, Object newObj) {
        return deepCompareWithPrefix(oldObj, newObj, "");
    }

    /**
     * 带路径前缀的深度对比
     */
    private static Boolean deepCompareWithPrefix(Object oldObj, Object newObj, String pathPrefix) {
        if (oldObj == null && newObj == null) {
            return true;
        }

        if (oldObj == null || newObj == null) {
            System.out.println("✗ [" + pathPrefix + "] 对象类型不一致: 旧值=" + oldObj + ", 新值=" + newObj);
            return false;
        }

        // 处理字符串类型 - 需要特别处理JSON格式
        if (oldObj instanceof String && newObj instanceof String) {
            String oldStr = (String) oldObj;
            String newStr = (String) newObj;

            // 如果都是 JSON 格式，进行解析后对比
            if (isJsonString(oldStr) && isJsonString(newStr)) {
                return compareJsonStrings(oldStr, newStr, pathPrefix);
            } else {
                // 普通字符串直接对比
                if (!Objects.equals(oldStr, newStr)) {
                    System.out.println("✗ [" + pathPrefix + "] 字符串值不相等: 旧=" + oldStr + ", 新=" + newStr);
                    return false;
                }
                return true;
            }
        }
        // 处理其他基本类型
        else if (isBasicType(oldObj.getClass())) {
            if (!Objects.equals(oldObj, newObj)) {
                System.out.println("✗ [" + pathPrefix + "] 值不相等: 旧=" + oldObj + ", 新=" + newObj);
                return false;
            }
            return true;
        }

        // 处理Map
        if (oldObj instanceof Map) {
            return deepCompareMaps((Map<?, ?>) oldObj, (Map<?, ?>) newObj, pathPrefix);
        }

        // 处理List
        if (oldObj instanceof List) {
            return deepCompareLists((List<?>) oldObj, (List<?>) newObj, pathPrefix);
        }

        // 处理数组
        if (oldObj.getClass().isArray()) {
            return deepCompareArrays(oldObj, newObj, pathPrefix);
        }

        // 处理普通对象
        return deepCompareObjects(oldObj, newObj, pathPrefix);
    }
    
    /**
     * 对比两个 JSON 字符串
     */
    private static Boolean compareJsonStrings(String oldJson, String newJson, String pathPrefix) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            mapper.registerModule(new JavaTimeModule());
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

            Object oldParsed = mapper.readValue(oldJson, Object.class);
            Object newParsed = mapper.readValue(newJson, Object.class);

            // 解析后直接进行深度对比，会自动输出字段差异
            return deepCompareWithPrefix(oldParsed, newParsed, pathPrefix + ".json");
        } catch (Exception e) {
            // 如果不是有效的 JSON，按普通字符串处理
            System.out.println("✗ [" + pathPrefix + "] JSON解析失败，按普通字符串对比: " + e.getMessage());
            if (!Objects.equals(oldJson, newJson)) {
                System.out.println("✗ [" + pathPrefix + "] 字符串值不相等: 旧=" + oldJson + ", 新=" + newJson);
                return false;
            }
            return true;
        }
    }


    /**
     * 深度对比Map
     */
    private static Boolean deepCompareMaps(Map<?, ?> oldMap, Map<?, ?> newMap, String pathPrefix) {
        if (oldMap.size() != newMap.size()) {
            System.out.println("✗ [" + pathPrefix + "] Map大小不一致: 旧=" + oldMap.size() + ", 新=" + newMap.size());
            return false;
        }

        Set<?> oldKeys = oldMap.keySet();
        Set<?> newKeys = newMap.keySet();

        // 检查键是否一致
        if (!oldKeys.equals(newKeys)) {
            Set<?> missingInNew = new HashSet<>(oldKeys);
            missingInNew.removeAll(newKeys);
            Set<?> extraInNew = new HashSet<>(newKeys);
            extraInNew.removeAll(oldKeys);

            if (!missingInNew.isEmpty()) {
                System.out.println("✗ [" + pathPrefix + "] 新Map缺少键: " + missingInNew);
            }
            if (!extraInNew.isEmpty()) {
                System.out.println("✗ [" + pathPrefix + "] 新Map多出键: " + extraInNew);
            }
            return false;
        }

        boolean allMatched = true;
        for (Object key : oldKeys) {
            Object oldValue = oldMap.get(key);
            Object newValue = newMap.get(key);
            String currentPath = pathPrefix.isEmpty() ? "key[" + key + "]" : pathPrefix + ".key[" + key + "]";

            if (!deepCompareWithPrefix(oldValue, newValue, currentPath)) {
                allMatched = false;
            }
        }

        return allMatched;
    }

    /**
     * 深度对比List
     */
    private static Boolean deepCompareLists(List<?> oldList, List<?> newList, String pathPrefix) {
        if (oldList.size() != newList.size()) {
            System.out.println("✗ [" + pathPrefix + "] List大小不一致: 旧=" + oldList.size() + ", 新=" + newList.size());
            return false;
        }

        boolean allMatched = true;
        for (int i = 0; i < oldList.size(); i++) {
            Object oldItem = oldList.get(i);
            Object newItem = newList.get(i);
            String currentPath = pathPrefix.isEmpty() ? "[" + i + "]" : pathPrefix + "[" + i + "]";

            if (!deepCompareWithPrefix(oldItem, newItem, currentPath)) {
                allMatched = false;
            }
        }

        return allMatched;
    }

    /**
     * 深度对比数组
     */
    private static Boolean deepCompareArrays(Object oldArray, Object newArray, String pathPrefix) {
        int oldLength = java.lang.reflect.Array.getLength(oldArray);
        int newLength = java.lang.reflect.Array.getLength(newArray);

        if (oldLength != newLength) {
            System.out.println("✗ [" + pathPrefix + "] 数组长度不一致: 旧=" + oldLength + ", 新=" + newLength);
            return false;
        }

        boolean allMatched = true;
        for (int i = 0; i < oldLength; i++) {
            Object oldItem = java.lang.reflect.Array.get(oldArray, i);
            Object newItem = java.lang.reflect.Array.get(newArray, i);
            String currentPath = pathPrefix.isEmpty() ? "[" + i + "]" : pathPrefix + "[" + i + "]";

            if (!deepCompareWithPrefix(oldItem, newItem, currentPath)) {
                allMatched = false;
            }
        }

        return allMatched;
    }

    /**
     * 深度对比普通对象
     */
    private static Boolean deepCompareObjects(Object oldObj, Object newObj, String pathPrefix) {
        Class<?> clazz = oldObj.getClass();
        Field[] fields = clazz.getDeclaredFields();

        boolean allMatched = true;
        for (Field field : fields) {
            if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) {
                continue; // 跳过静态字段
            }

            field.setAccessible(true);
            try {
                Object oldValue = field.get(oldObj);
                Object newValue = field.get(newObj);
                String currentPath = pathPrefix.isEmpty() ? field.getName() : pathPrefix + "." + field.getName();

                if (!deepCompareWithPrefix(oldValue, newValue, currentPath)) {
                    allMatched = false;
                }
            } catch (IllegalAccessException e) {
                System.err.println("无法访问字段: " + field.getName() + ", 错误: " + e.getMessage());
            }
        }

        return allMatched;
    }

    /**
     * 判断是否为基础类型（基本类型、包装类型、字符串、枚举、日期等）
     */
    private static boolean isBasicType(Class<?> clazz) {
        return clazz.isPrimitive() ||
                clazz == Boolean.class || clazz == Character.class ||
                clazz == Byte.class || clazz == Short.class ||
                clazz == Integer.class || clazz == Long.class ||
                clazz == Float.class || clazz == Double.class ||
                clazz == String.class ||
                clazz.isEnum() ||
                // 日期类型支持
                clazz == java.util.Date.class ||
                clazz == java.sql.Date.class ||
                clazz == java.time.LocalDateTime.class ||
                clazz == java.time.LocalDate.class ||
                clazz == java.time.LocalTime.class ||
                clazz == java.time.Instant.class ||
                clazz == java.time.ZonedDateTime.class ||
                clazz == java.time.OffsetDateTime.class ||
                clazz == java.sql.Timestamp.class;
    }

    /**
     * 判断字符串是否为 JSON 格式
     */
    private static boolean isJsonString(String str) {
        if (str == null || str.trim().isEmpty()) {
            return false;
        }

        String trimmed = str.trim();
        return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"));
    }


    /**
     * 针对您提到的具体类型的便捷对比方法
     */
    public static <K, V> Boolean compareMapOfLists(Map<K, List<V>> oldMap, Map<K, List<V>> newMap) {
        return deepCompare(oldMap, newMap);
    }

    public static <T> Boolean compareListOfObjects(List<T> oldList, List<T> newList) {
        return deepCompare(oldList, newList);
    }

    public static <T> Boolean comparePageVO(PageVO<T> oldPage, PageVO<T> newPage) {
        return deepCompare(oldPage, newPage);
    }
}
