package etl

import (
	"context"
	"fmt"
	"os"
	"runtime"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
	"github.com/paulmach/osm"
	"github.com/paulmach/osm/osmpbf"
)

func Run(ctx context.Context, pbfPath string, driver neo4j.Driver) error {
	fmt.Printf("Reading file %s\n", pbfPath)
	f, err := os.Open(pbfPath)
	if err != nil {
		panic(err)
	}
	defer f.Close()

	fmt.Printf("Parsing OSM data\n")
	scanner := osmpbf.New(ctx, f, runtime.GOMAXPROCS(-1))
	defer scanner.Close()

	scanner.FilterNode = filterNode
	scanner.SkipRelations = true
	scanner.SkipWays = true
	fmt.Printf("Scanning...\n")
	for scanner.Scan() {
		switch o := scanner.Object().(type) {
		case *osm.Node:
			poi, err := transformNode(o)
			if err != nil {
				fmt.Printf("Error at transform")
				panic(err)
			}
			err = loadPOI(ctx, poi, driver)
			if err != nil {
				fmt.Printf("Error at load")
				panic(err)
			}
		case *osm.Way:
		case *osm.Relation:
		}
	}

	return scanner.Err()
}
