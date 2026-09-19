package etl

import (
	"context"
	"errors"
	"fmt"
	"nosql/internal/domain"
	"os"
	"runtime"
	"sync"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
	"github.com/paulmach/osm"
	"github.com/paulmach/osm/osmpbf"
)

func scan(ctx context.Context, scanner *osmpbf.Scanner, pois chan<- *domain.POI) error {
	defer close(pois)

	for scanner.Scan() {
		switch o := scanner.Object().(type) {
		case *osm.Node:
			poi, err := transformNode(o)
			if err != nil {
				return fmt.Errorf("transform node %d: %w", o.ID, err)
			}

			select {
			case pois <- poi:
			case <-ctx.Done():
				return ctx.Err()
			}
		case *osm.Way:
		case *osm.Relation:
		}
	}

	return nil
}

func Run(ctx context.Context, pbfPath string, driver neo4j.Driver) error {
	fmt.Printf("Reading file %s\n", pbfPath)
	f, err := os.Open(pbfPath)
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Printf("Parsing OSM data\n")
	scanner := osmpbf.New(ctx, f, runtime.GOMAXPROCS(-1))
	defer scanner.Close()

	scanner.FilterNode = filterNode
	scanner.SkipRelations = true
	scanner.SkipWays = true

	fmt.Printf("Scanning...\n")

	var wg sync.WaitGroup
	pois := make(chan *domain.POI, 1000)
	var scanErr, loadErr error

	wg.Go(func() {
		scanErr = scan(ctx, scanner, pois)
	})
	wg.Go(func() {
		loadErr = loadPOIS(ctx, driver, pois)
	})

	wg.Wait()
	return errors.Join(scanner.Err(), scanErr, loadErr)
}
