// 命令 server 启动知乎精神宇宙。
//
// 语料来源由 MINDVERSE_SOURCE 控制：mock（默认，无需凭证）或 live（真实 OAuth）。
// 凭证到位前全部开发跑在 mock 上，到位后只改这一个环境变量。
package main

import (
	"flag"
	"log"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/extract"
	"github.com/chouheiwa/mindverse/internal/server"
)

func main() {
	cfgPath := flag.String("config", "hackathon.config.json", "配置文件路径")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// 概念抽取优先用大模型；未配置时回退到离线标注，
	// 保证没有模型也能演示 —— 但界面必须如实标注来源。
	var ext extract.Extractor
	if llm, err := extract.LLMFromEnv(); err == nil {
		ext = extract.NewLLMExtractor(llm)
		log.Printf("真实/游客概念抽取：大模型（%s）；mock 使用离线标注与固定宇宙缓存", llm.Model)
	} else {
		ext = &extract.FileExtractor{Path: cfg.ConceptsPath}
		log.Printf("概念抽取：离线标注 %s（%v）", cfg.ConceptsPath, err)
	}

	srv, err := server.New(cfg, ext)
	if err != nil {
		log.Fatalf("初始化失败: %v", err)
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
