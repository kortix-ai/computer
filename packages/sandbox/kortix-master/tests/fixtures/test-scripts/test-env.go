package main

import (
	"encoding/json"
	"os"
)

type Result struct {
	Language string `json:"language"`
	Key      string `json:"key"`
	Value    string `json:"value"`
	Found    bool   `json:"found"`
}

func main() {
	if len(os.Args) < 2 {
		result := map[string]string{"error": "Key argument required"}
		json.NewEncoder(os.Stdout).Encode(result)
		os.Exit(1)
	}

	key := os.Args[1]
	value, found := os.LookupEnv(key)

	result := Result{
		Language: "go",
		Key:      key,
		Value:    value,
		Found:    found,
	}

	json.NewEncoder(os.Stdout).Encode(result)
}
