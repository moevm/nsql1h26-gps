package main

import (
	"context"
	"fmt"
	"nosql/internal/etl"
	"os"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

func main() {
	fmt.Printf("Running ETL: osm.pbf -> neo4j\n")
	host := os.Getenv("NEO4J_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("NEO4J_BOLT_PORT")
	if port == "" {
		port = "7687"
	}
	user := os.Getenv("NEO4J_USER")
	if user == "" {
		user = "neo4j"
	}
	password := os.Getenv("NEO4J_PASSWORD")

	dbURI := "bolt://" + host + ":" + port
	fmt.Printf("DB URI: %s\n", dbURI)
	driver, err := neo4j.NewDriver(dbURI, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		panic(err)
	}
	ctx := context.Background()
	defer driver.Close(ctx)

	err = driver.VerifyConnectivity(ctx)
	if err != nil {
		panic(err)
	}

	if len(os.Args) < 3 {
		panic("PBF Path not specified")
	}
	pbfPath := os.Args[2]

	err = etl.Run(ctx, pbfPath, driver)
	if err != nil {
		panic(err)
	}
}
