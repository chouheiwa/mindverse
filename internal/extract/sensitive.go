package extract

import (
	"strings"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// 管线 ①：敏感类目过滤。
//
// 本项目在法律定性上是「用户画像 + 自动化决策」，《个人信息保护法》要求
// 保证决策透明、提供拒绝方式，并遵循最小必要。以下类目一律不进入概念层、
// 不进入星图、不进入分享卡。
//
// 关键：过滤发生在概念抽取之前，不是最后一步 —— 否则敏感内容已经
// 进入过模型上下文与中间产物。
var sensitiveCategories = []string{
	"政治立场", "宗教信仰", "健康与医疗", "疾病", "心理健康",
	"性取向", "性生活", "种族", "民族", "犯罪记录",
	"精确定位", "家庭住址", "金融账户", "银行卡", "身份证",
	"未成年人身份", "生物识别",
}

// sensitiveHints 用于条目级预过滤的关键词。
//
// 刻意保守：宁可少过滤也不误伤正常技术内容，真正的兜底是概念层黑名单
// 与分享卡生成前的二次校验。
var sensitiveHints = []string{
	"身份证号", "银行卡号", "手机号是", "家庭住址", "确诊",
	"抑郁症", "精神分裂", "艾滋", "同性恋", "性取向",
	"宗教信仰", "政治立场", "犯罪记录", "服刑",
}

// IsSensitiveConcept 报告一个概念是否落在敏感类目里。
func IsSensitiveConcept(c string) bool {
	for _, s := range sensitiveCategories {
		if strings.Contains(c, s) {
			return true
		}
	}
	return false
}

// IsSensitiveItem 报告一条内容是否应在抽取前就被剔除。
func IsSensitiveItem(title, summary string) bool {
	t := title + " " + summary
	for _, h := range sensitiveHints {
		if strings.Contains(t, h) {
			return true
		}
	}
	return false
}

// FilterConcepts 去掉敏感概念与空值，并按出现顺序去重。
func FilterConcepts(cs []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(cs))
	for _, c := range cs {
		c = strings.TrimSpace(c)
		if c == "" || seen[c] || IsSensitiveConcept(c) {
			continue
		}
		// 概念应当是短词，模型偶尔会吐出整句
		if len([]rune(c)) > 12 {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

// CountSensitiveItems 统计被 ① 剔除的条目数。
//
// 必须向用户如实说明有多少内容未参与分析 —— 静默丢弃既不符合
// 《个人信息保护法》的透明度要求，也会让「N 条足迹」这个数字对不上。
func CountSensitiveItems(items []zhihu.Item) int {
	n := 0
	for _, it := range items {
		if IsSensitiveItem(it.Title, it.Summary) {
			n++
		}
	}
	return n
}
